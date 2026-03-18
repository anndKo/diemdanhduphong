import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS_DEVICE = 5;
const MAX_ATTEMPTS_IP = 8;
const BLOCK_DURATION_MINUTES = 30;
const ESCALATION_MULTIPLIER = 2; // Each subsequent block doubles

function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").pop();
    const body = await req.json();
    const ip = getClientIP(req);
    const { device_hash, password } = body;

    if (!device_hash) {
      return new Response(
        JSON.stringify({ error: "Missing device identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const respond = (data: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Helper: get or create attempt record by device_hash
    const getDeviceAttempts = async () => {
      const { data } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("*")
        .eq("device_hash", device_hash)
        .single();
      return data;
    };

    // Helper: get or create attempt record by IP
    const getIPAttempts = async () => {
      const { data } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("*")
        .eq("ip_address", ip)
        .is("device_hash", null)
        .single();
      return data;
    };

    // Helper: check if blocked
    const isBlocked = (record: any): { blocked: boolean; remaining_seconds?: number } => {
      if (!record?.blocked_until) return { blocked: false };
      const blockedUntil = new Date(record.blocked_until);
      if (blockedUntil.getTime() <= Date.now()) return { blocked: false };
      return {
        blocked: true,
        remaining_seconds: Math.ceil((blockedUntil.getTime() - Date.now()) / 1000),
      };
    };

    // Helper: compute block duration based on previous blocks
    const computeBlockDuration = (currentAttemptCount: number): number => {
      // Base 30 min, escalate if they've been blocked before
      const multiplier = Math.floor(currentAttemptCount / MAX_ATTEMPTS_DEVICE);
      return BLOCK_DURATION_MINUTES * Math.pow(ESCALATION_MULTIPLIER, Math.max(0, multiplier - 1));
    };

    // ============ CHECK STATUS ============
    if (action === "check-status") {
      // Check device block
      const deviceRecord = await getDeviceAttempts();
      const deviceBlocked = isBlocked(deviceRecord);
      if (deviceBlocked.blocked) {
        return respond({
          blocked: true,
          remaining_seconds: deviceBlocked.remaining_seconds,
          remaining_attempts: 0,
          reason: "Thiết bị đã bị khóa do nhập sai mật khẩu bảo vệ quá nhiều lần",
        });
      }

      // Check IP block (catches incognito/different browsers)
      const { data: ipRecords } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("*")
        .eq("ip_address", ip)
        .not("blocked_until", "is", null);

      for (const rec of ipRecords || []) {
        const ipBlocked = isBlocked(rec);
        if (ipBlocked.blocked) {
          return respond({
            blocked: true,
            remaining_seconds: ipBlocked.remaining_seconds,
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa do nhập sai mật khẩu bảo vệ quá nhiều lần (phát hiện qua mạng)",
          });
        }
      }

      // Check device_blocks table too (shared with login security)
      const { data: deviceBlock } = await supabaseAdmin
        .from("device_blocks")
        .select("*")
        .eq("device_hash", device_hash)
        .single();

      if (deviceBlock) {
        if (deviceBlock.is_permanent) {
          return respond({
            blocked: true,
            remaining_seconds: null,
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa vĩnh viễn",
            permanent: true,
          });
        }
        if (deviceBlock.blocked_until && new Date(deviceBlock.blocked_until) > new Date()) {
          return respond({
            blocked: true,
            remaining_seconds: Math.ceil((new Date(deviceBlock.blocked_until).getTime() - Date.now()) / 1000),
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa do vi phạm bảo mật",
          });
        }
      }

      const currentAttempts = deviceRecord?.attempt_count || 0;
      return respond({
        blocked: false,
        remaining_attempts: Math.max(0, MAX_ATTEMPTS_DEVICE - currentAttempts),
      });
    }

    // ============ VERIFY PASSWORD ============
    if (action === "verify") {
      if (!password) {
        return respond({ error: "Missing password" }, 400);
      }

      // First check if blocked by device
      const deviceRecord = await getDeviceAttempts();
      const deviceBlocked = isBlocked(deviceRecord);
      if (deviceBlocked.blocked) {
        return respond({
          success: false,
          blocked: true,
          remaining_seconds: deviceBlocked.remaining_seconds,
          remaining_attempts: 0,
          reason: "Thiết bị đã bị khóa",
        });
      }

      // Check IP block
      const { data: ipRecords } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("*")
        .eq("ip_address", ip)
        .not("blocked_until", "is", null);

      for (const rec of ipRecords || []) {
        const ipBlocked = isBlocked(rec);
        if (ipBlocked.blocked) {
          return respond({
            success: false,
            blocked: true,
            remaining_seconds: ipBlocked.remaining_seconds,
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa (phát hiện qua mạng)",
          });
        }
      }

      // Check device_blocks table
      const { data: deviceBlock } = await supabaseAdmin
        .from("device_blocks")
        .select("*")
        .eq("device_hash", device_hash)
        .single();

      if (deviceBlock) {
        if (deviceBlock.is_permanent) {
          return respond({
            success: false,
            blocked: true,
            permanent: true,
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa vĩnh viễn",
          });
        }
        if (deviceBlock.blocked_until && new Date(deviceBlock.blocked_until) > new Date()) {
          return respond({
            success: false,
            blocked: true,
            remaining_seconds: Math.ceil((new Date(deviceBlock.blocked_until).getTime() - Date.now()) / 1000),
            remaining_attempts: 0,
            reason: "Thiết bị đã bị khóa",
          });
        }
      }

      // Verify the password directly against all enabled protection passwords
      // We query all enabled passwords and check with pgcrypto
      const { data: protectionRecords, error: queryError } = await supabaseAdmin
        .from("protection_passwords")
        .select("password_hash, user_id")
        .eq("enabled", true);

      if (queryError) {
        console.error("Query error:", queryError);
        return respond({ error: "Verification failed" }, 500);
      }

      // Check password against each enabled hash using SQL crypt comparison
      let isValid = false;
      for (const record of protectionRecords || []) {
        const { data: match } = await supabaseAdmin.rpc("verify_protection_password_raw", {
          p_password: password,
          p_hash: record.password_hash,
        });
        if (match) {
          isValid = true;
          break;
        }
      }

      if (isValid) {
        // Success - reset attempts for this device and IP
        if (deviceRecord) {
          await supabaseAdmin
            .from("protection_password_attempts")
            .update({
              attempt_count: 0,
              blocked_until: null,
              last_attempt_at: new Date().toISOString(),
            })
            .eq("device_hash", device_hash);
        }

        // Log success
        await supabaseAdmin.from("security_logs").insert({
          device_hash,
          ip_address: ip,
          action: "protection_password_verified",
          details: { success: true },
        });

        return respond({ success: true, blocked: false });
      }

      // Failed attempt - increment counter
      const now = new Date().toISOString();
      let newCount: number;

      if (deviceRecord) {
        newCount = (deviceRecord.attempt_count || 0) + 1;
        const updates: any = {
          attempt_count: newCount,
          last_attempt_at: now,
          ip_address: ip,
        };

        if (newCount >= MAX_ATTEMPTS_DEVICE) {
          const blockMinutes = computeBlockDuration(newCount);
          const blockedUntilDate = new Date(Date.now() + blockMinutes * 60 * 1000);
          updates.blocked_until = blockedUntilDate.toISOString();

          // Also block in device_blocks table for cross-browser enforcement
          await supabaseAdmin.from("device_blocks").upsert(
            {
              device_hash,
              blocked_until: blockedUntilDate.toISOString(),
              block_count: (deviceBlock?.block_count || 0) + 1,
              reason: "Nhập sai mật khẩu bảo vệ quá nhiều lần",
              is_permanent: (deviceBlock?.block_count || 0) + 1 > 5,
              updated_at: now,
            },
            { onConflict: "device_hash" }
          );
        }

        await supabaseAdmin
          .from("protection_password_attempts")
          .update(updates)
          .eq("device_hash", device_hash);
      } else {
        newCount = 1;
        const inserts: any = {
          device_hash,
          attempt_count: 1,
          last_attempt_at: now,
          ip_address: ip,
        };

        if (newCount >= MAX_ATTEMPTS_DEVICE) {
          const blockMinutes = computeBlockDuration(newCount);
          inserts.blocked_until = new Date(Date.now() + blockMinutes * 60 * 1000).toISOString();
        }

        await supabaseAdmin
          .from("protection_password_attempts")
          .insert(inserts);
      }

      // Also track by IP for cross-browser detection
      const { data: existingIPRecord } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("*")
        .eq("ip_address", ip)
        .neq("device_hash", device_hash)
        .order("attempt_count", { ascending: false })
        .limit(1)
        .single();

      // Sum all attempts from same IP across all devices
      const { data: allIPAttempts } = await supabaseAdmin
        .from("protection_password_attempts")
        .select("attempt_count")
        .eq("ip_address", ip);

      const totalIPAttempts = (allIPAttempts || []).reduce(
        (sum: number, r: any) => sum + (r.attempt_count || 0),
        0
      );

      if (totalIPAttempts >= MAX_ATTEMPTS_IP) {
        // Block all records from this IP
        const blockMinutes = computeBlockDuration(totalIPAttempts);
        const blockedUntilDate = new Date(Date.now() + blockMinutes * 60 * 1000).toISOString();

        await supabaseAdmin
          .from("protection_password_attempts")
          .update({ blocked_until: blockedUntilDate })
          .eq("ip_address", ip);

        // Log IP-based block
        await supabaseAdmin.from("security_logs").insert({
          device_hash,
          ip_address: ip,
          action: "protection_ip_blocked",
          details: { total_ip_attempts: totalIPAttempts, block_minutes: blockMinutes },
        });
      }

      // Log failed attempt
      await supabaseAdmin.from("security_logs").insert({
        device_hash,
        ip_address: ip,
        action: "protection_password_failed",
        details: { attempt_count: newCount, total_ip_attempts: totalIPAttempts },
      });

      const remaining = Math.max(0, MAX_ATTEMPTS_DEVICE - newCount);

      if (newCount >= MAX_ATTEMPTS_DEVICE) {
        const blockMinutes = computeBlockDuration(newCount);
        return respond({
          success: false,
          blocked: true,
          remaining_attempts: 0,
          remaining_seconds: blockMinutes * 60,
          reason: `Thiết bị đã bị khóa ${blockMinutes} phút do nhập sai quá ${MAX_ATTEMPTS_DEVICE} lần`,
        });
      }

      return respond({
        success: false,
        blocked: false,
        remaining_attempts: remaining,
        reason: `Mật khẩu không đúng! Còn ${remaining} lượt thử`,
      });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Protection check error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

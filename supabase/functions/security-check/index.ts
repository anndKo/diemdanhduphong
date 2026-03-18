import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ACCOUNTS_PER_DEVICE = 3;
const MAX_LOGIN_ATTEMPTS_DEVICE = 5;
const MAX_LOGIN_ATTEMPTS_EMAIL = 5;
const MAX_LOGIN_ATTEMPTS_IP = 10; // IP gets more attempts since shared IPs exist
const RATE_LIMIT_WINDOW_MINUTES = 30;
const DEVICE_RESET_DAYS = 30;
const BASE_BLOCK_SECONDS = 15 * 60; // 15 minutes

function getBlockDuration(blockCount: number): number {
  const duration = BASE_BLOCK_SECONDS * Math.pow(2, blockCount - 1);
  return Math.min(duration, 24 * 60 * 60); // Cap at 24 hours
}

function getClientIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function computeRiskScore(details: {
  isBot: boolean;
  hasWebdriver: boolean;
  missingFeatures: string[];
  behaviorScore: number;
}): number {
  let score = 0;
  if (details.isBot) score += 50;
  if (details.hasWebdriver) score += 40;
  if (details.missingFeatures?.length > 2) score += 20;
  if (details.behaviorScore < 30) score += 30;
  return Math.min(score, 100);
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

    const {
      device_hash,
      email,
      user_agent,
      bot_signals,
      behavior_data,
      fingerprint_components,
    } = body;

    if (!device_hash) {
      return new Response(
        JSON.stringify({ error: "Missing device identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const riskScore = bot_signals ? computeRiskScore(bot_signals) : 0;

    const logEvent = async (logAction: string, details: Record<string, unknown>) => {
      await supabaseAdmin.from("security_logs").insert({
        device_hash,
        ip_address: ip,
        action: logAction,
        details,
        risk_score: riskScore,
      });
    };

    // ============ CHECK DEVICE BLOCK (with 30-day reset) ============
    const checkDeviceBlock = async () => {
      const { data: block } = await supabaseAdmin
        .from("device_blocks")
        .select("*")
        .eq("device_hash", device_hash)
        .single();

      if (!block) return { blocked: false, block_count: 0 };

      const lastUpdated = new Date(block.updated_at).getTime();
      const daysSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate >= DEVICE_RESET_DAYS) {
        await supabaseAdmin.from("device_blocks").delete().eq("device_hash", device_hash);
        await logEvent("device_block_reset", { days_since_update: daysSinceUpdate });
        return { blocked: false, block_count: 0 };
      }

      if (block.is_permanent) {
        return {
          blocked: true,
          reason: "Thiết bị đã bị khóa vĩnh viễn do vi phạm quá nhiều lần",
          blocked_until: null,
          permanent: true,
          block_count: block.block_count,
        };
      }

      if (block.blocked_until && new Date(block.blocked_until) > new Date()) {
        const remainingSeconds = Math.ceil(
          (new Date(block.blocked_until).getTime() - Date.now()) / 1000
        );
        return {
          blocked: true,
          reason: "Thiết bị tạm thời bị khóa do đăng nhập sai quá nhiều lần",
          blocked_until: block.blocked_until,
          remaining_seconds: remainingSeconds,
          block_count: block.block_count,
        };
      }

      return { blocked: false, block_count: block.block_count };
    };

    // ============ CHECK IP BLOCK ============
    const checkIPBlock = async () => {
      const { data: block } = await supabaseAdmin
        .from("ip_blocks")
        .select("*")
        .eq("ip_address", ip)
        .single();

      if (!block) return { blocked: false, block_count: 0 };

      const lastUpdated = new Date(block.updated_at).getTime();
      const daysSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate >= DEVICE_RESET_DAYS) {
        await supabaseAdmin.from("ip_blocks").delete().eq("ip_address", ip);
        return { blocked: false, block_count: 0 };
      }

      if (block.is_permanent) {
        return {
          blocked: true,
          reason: "Địa chỉ mạng đã bị khóa vĩnh viễn do vi phạm quá nhiều lần",
          blocked_until: null,
          permanent: true,
          block_count: block.block_count,
        };
      }

      if (block.blocked_until && new Date(block.blocked_until) > new Date()) {
        const remainingSeconds = Math.ceil(
          (new Date(block.blocked_until).getTime() - Date.now()) / 1000
        );
        return {
          blocked: true,
          reason: "Địa chỉ mạng tạm thời bị khóa do đăng nhập sai quá nhiều lần",
          blocked_until: block.blocked_until,
          remaining_seconds: remainingSeconds,
          block_count: block.block_count,
        };
      }

      return { blocked: false, block_count: block.block_count };
    };

    // ============ BLOCK IP ============
    const blockIP = async (prevBlockCount: number) => {
      const newBlockCount = prevBlockCount + 1;
      const isPermanent = newBlockCount > 10;
      const duration = getBlockDuration(newBlockCount);
      const blockedUntil = isPermanent ? null : new Date(Date.now() + duration * 1000).toISOString();

      await supabaseAdmin.from("ip_blocks").upsert(
        {
          ip_address: ip,
          blocked_until: blockedUntil,
          block_count: newBlockCount,
          reason: "Đăng nhập sai quá nhiều lần từ cùng địa chỉ mạng",
          is_permanent: isPermanent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ip_address" }
      );

      return { newBlockCount, isPermanent, duration, blockedUntil };
    };

    // ============ CHECK EMAIL-BASED RATE LIMIT ============
    const checkEmailRateLimit = async (checkEmail: string) => {
      if (!checkEmail) return { blocked: false, attempts: 0 };

      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

      const { count: failCount } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("email", checkEmail.toLowerCase())
        .eq("success", false)
        .gte("created_at", windowStart);

      const attempts = failCount || 0;

      if (attempts >= MAX_LOGIN_ATTEMPTS_EMAIL) {
        return {
          blocked: true,
          attempts,
          reason: `Email đã bị tạm khóa do đăng nhập sai ${attempts} lần. Vui lòng thử lại sau ${RATE_LIMIT_WINDOW_MINUTES} phút.`,
          remaining_minutes: RATE_LIMIT_WINDOW_MINUTES,
        };
      }

      return { blocked: false, attempts };
    };

    // ============ PRE-REGISTER CHECK ============
    if (action === "check-register") {
      const deviceBlock = await checkDeviceBlock();
      if (deviceBlock.blocked) {
        await logEvent("register_blocked_device", { reason: deviceBlock.reason });
        return new Response(JSON.stringify({ allowed: false, ...deviceBlock }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ipBlock = await checkIPBlock();
      if (ipBlock.blocked) {
        await logEvent("register_blocked_ip", { reason: ipBlock.reason });
        return new Response(JSON.stringify({ allowed: false, ...ipBlock }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (riskScore >= 70) {
        await logEvent("register_high_risk", { risk_score: riskScore, bot_signals });
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "Phát hiện hoạt động bất thường. Vui lòng thử lại sau.",
            risk_score: riskScore,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { count } = await supabaseAdmin
        .from("device_fingerprints")
        .select("*", { count: "exact", head: true })
        .eq("device_hash", device_hash);

      const registrationCount = count || 0;

      if (registrationCount >= MAX_ACCOUNTS_PER_DEVICE) {
        await logEvent("register_limit_exceeded", {
          count: registrationCount,
          max: MAX_ACCOUNTS_PER_DEVICE,
        });

        await supabaseAdmin.from("device_blocks").upsert(
          {
            device_hash,
            reason: "Vượt quá giới hạn đăng ký tài khoản",
            block_count: 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_hash" }
        );

        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "Thiết bị đã đạt giới hạn đăng ký tài khoản",
            count: registrationCount,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await logEvent("register_check_passed", { count: registrationCount });
      return new Response(
        JSON.stringify({ allowed: true, remaining: MAX_ACCOUNTS_PER_DEVICE - registrationCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ REGISTER DEVICE ============
    if (action === "register-device") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("device_fingerprints").insert({
        device_hash,
        user_id,
        ip_address: ip,
        user_agent: user_agent || null,
        raw_components: fingerprint_components || null,
      });

      await logEvent("device_registered", { user_id });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ PRE-LOGIN CHECK ============
    if (action === "check-login") {
      // 1. Check device block
      const deviceBlock = await checkDeviceBlock();
      if (deviceBlock.blocked) {
        await logEvent("login_blocked_device", { reason: deviceBlock.reason, email });
        return new Response(JSON.stringify({ allowed: false, ...deviceBlock }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2. Check IP block
      const ipBlock = await checkIPBlock();
      if (ipBlock.blocked) {
        await logEvent("login_blocked_ip", { reason: ipBlock.reason, email, ip });
        return new Response(JSON.stringify({ allowed: false, ...ipBlock }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3. Check email rate limit
      if (email) {
        const emailCheck = await checkEmailRateLimit(email);
        if (emailCheck.blocked) {
          await logEvent("login_email_rate_limited", { email, attempts: emailCheck.attempts });
          return new Response(
            JSON.stringify({
              allowed: false,
              blocked: true,
              reason: emailCheck.reason,
              remaining_minutes: emailCheck.remaining_minutes,
              email_blocked: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 4. High risk bot detection
      if (riskScore >= 70) {
        await logEvent("login_high_risk", { risk_score: riskScore, bot_signals, email });
        return new Response(
          JSON.stringify({
            allowed: false,
            reason: "Phát hiện hoạt động bất thường. Vui lòng thử lại sau.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 5. Device-level rate limit
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
      const { count: deviceFailCount } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("device_hash", device_hash)
        .eq("success", false)
        .gte("created_at", windowStart);

      const deviceAttempts = deviceFailCount || 0;

      if (deviceAttempts >= MAX_LOGIN_ATTEMPTS_DEVICE) {
        const prevBlockCount = deviceBlock.block_count || 0;
        const newBlockCount = prevBlockCount + 1;
        const isPermanent = newBlockCount > 10;
        const duration = getBlockDuration(newBlockCount);
        const blockedUntil = isPermanent ? null : new Date(Date.now() + duration * 1000).toISOString();

        await supabaseAdmin.from("device_blocks").upsert(
          {
            device_hash,
            blocked_until: blockedUntil,
            block_count: newBlockCount,
            reason: "Đăng nhập sai quá nhiều lần",
            is_permanent: isPermanent,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "device_hash" }
        );

        await logEvent("device_blocked", {
          block_count: newBlockCount,
          blocked_until: blockedUntil,
          is_permanent: isPermanent,
          duration_seconds: duration,
          email,
        });

        const remainingSeconds = blockedUntil
          ? Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000)
          : null;

        return new Response(
          JSON.stringify({
            allowed: false,
            blocked: true,
            reason: isPermanent
              ? "Thiết bị đã bị khóa vĩnh viễn do vi phạm quá nhiều lần"
              : `Thiết bị tạm thời bị khóa. Thời gian khóa: ${Math.ceil(duration / 60)} phút`,
            blocked_until: blockedUntil,
            remaining_seconds: remainingSeconds,
            permanent: isPermanent,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 6. IP-level rate limit (catches incognito/different browsers)
      const { count: ipFailCount } = await supabaseAdmin
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip)
        .eq("success", false)
        .gte("created_at", windowStart);

      const ipAttempts = ipFailCount || 0;

      if (ipAttempts >= MAX_LOGIN_ATTEMPTS_IP) {
        const prevIPBlockCount = ipBlock.block_count || 0;
        const ipBlockResult = await blockIP(prevIPBlockCount);

        await logEvent("ip_blocked", {
          block_count: ipBlockResult.newBlockCount,
          blocked_until: ipBlockResult.blockedUntil,
          is_permanent: ipBlockResult.isPermanent,
          duration_seconds: ipBlockResult.duration,
          email,
          ip,
        });

        const remainingSeconds = ipBlockResult.blockedUntil
          ? Math.ceil((new Date(ipBlockResult.blockedUntil).getTime() - Date.now()) / 1000)
          : null;

        return new Response(
          JSON.stringify({
            allowed: false,
            blocked: true,
            reason: ipBlockResult.isPermanent
              ? "Địa chỉ mạng đã bị khóa vĩnh viễn do vi phạm quá nhiều lần"
              : `Địa chỉ mạng tạm thời bị khóa do đăng nhập sai quá nhiều. Thời gian khóa: ${Math.ceil(ipBlockResult.duration / 60)} phút`,
            blocked_until: ipBlockResult.blockedUntil,
            remaining_seconds: remainingSeconds,
            permanent: ipBlockResult.isPermanent,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailCheck = email ? await checkEmailRateLimit(email) : { attempts: 0 };

      await logEvent("login_check_passed", { deviceAttempts, ipAttempts, email, ip });
      return new Response(
        JSON.stringify({
          allowed: true,
          device_attempts_remaining: MAX_LOGIN_ATTEMPTS_DEVICE - deviceAttempts,
          ip_attempts_remaining: MAX_LOGIN_ATTEMPTS_IP - ipAttempts,
          email_attempts_remaining: MAX_LOGIN_ATTEMPTS_EMAIL - (emailCheck.attempts || 0),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ LOG LOGIN ATTEMPT ============
    if (action === "log-attempt") {
      const { success } = body;

      await supabaseAdmin.from("login_attempts").insert({
        device_hash,
        email: email ? email.toLowerCase() : null,
        ip_address: ip,
        user_agent: user_agent || null,
        success: success || false,
        behavior_data: behavior_data || null,
      });

      // On successful login, reset device and IP blocks + clear failed attempts
      if (success) {
        await logEvent("login_success", { email, ip });

        // Reset device block
        await supabaseAdmin
          .from("device_blocks")
          .delete()
          .eq("device_hash", device_hash);

        // Reset IP block
        await supabaseAdmin
          .from("ip_blocks")
          .delete()
          .eq("ip_address", ip);

        // Delete recent failed login attempts for this device+email
        if (email) {
          await supabaseAdmin
            .from("login_attempts")
            .delete()
            .eq("device_hash", device_hash)
            .eq("email", email.toLowerCase())
            .eq("success", false);
        }
      } else {
        await logEvent("login_failed", { email, ip });
      }

      return new Response(JSON.stringify({ logged: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ CHECK ACCOUNT REQUEST LIMIT ============
    if (action === "check-account-request") {
      const { phone } = body;
      const MAX_REQUESTS = 2;

      // Check device block
      const deviceBlock = await checkDeviceBlock();
      if (deviceBlock.blocked) {
        return new Response(JSON.stringify({ allowed: false, reason: deviceBlock.reason }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check IP block
      const ipBlock = await checkIPBlock();
      if (ipBlock.blocked) {
        return new Response(JSON.stringify({ allowed: false, reason: ipBlock.reason }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Bot check
      if (riskScore >= 70) {
        return new Response(JSON.stringify({ allowed: false, reason: "Phát hiện hoạt động bất thường." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Count requests by device_hash
      const { count: deviceCount } = await supabaseAdmin
        .from("account_requests")
        .select("*", { count: "exact", head: true })
        .eq("device_hash", device_hash);

      // Count requests by IP
      const { count: ipCount } = await supabaseAdmin
        .from("account_requests")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", ip);

      const totalCount = Math.max(deviceCount || 0, ipCount || 0);

      if (totalCount >= MAX_REQUESTS) {
        await logEvent("account_request_limit", { device_hash, ip, deviceCount, ipCount });
        return new Response(
          JSON.stringify({ allowed: false, reason: `Thiết bị/mạng đã đạt giới hạn ${MAX_REQUESTS} yêu cầu đăng ký.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check duplicate email
      const { count: emailCount } = await supabaseAdmin
        .from("account_requests")
        .select("*", { count: "exact", head: true })
        .eq("email", email?.toLowerCase())
        .eq("status", "pending");

      if ((emailCount || 0) > 0) {
        return new Response(
          JSON.stringify({ allowed: false, reason: "Email này đã có yêu cầu đang chờ xử lý." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert the request
      await supabaseAdmin.from("account_requests").insert({
        email: email?.toLowerCase(),
        phone: phone || null,
        device_hash,
        ip_address: ip,
      });

      await logEvent("account_request_created", { email, ip, device_hash });
      return new Response(
        JSON.stringify({ allowed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ CHECK DEVICE BLOCK STATUS (no auth needed) ============
    if (action === "check-device-block") {
      const deviceBlock = await checkDeviceBlock();
      if (deviceBlock.blocked) {
        return new Response(JSON.stringify(deviceBlock), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ipBlock = await checkIPBlock();
      if (ipBlock.blocked) {
        return new Response(JSON.stringify(ipBlock), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ blocked: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Security check error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

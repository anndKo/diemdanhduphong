import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_REQUESTS_PER_DEVICE = 3;
const ADMIN_EMAIL = "admindiemdanh@gmail.com";

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

    // ============ SUBMIT FORGOT PASSWORD REQUEST ============
    if (action === "submit-request") {
      const { email, phone, device_hash } = body;

      if (!email || !device_hash) {
        return new Response(
          JSON.stringify({ error: "Thiếu thông tin bắt buộc" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check device limit
      const { count } = await supabaseAdmin
        .from("password_reset_requests")
        .select("*", { count: "exact", head: true })
        .eq("device_hash", device_hash);

      if ((count || 0) >= MAX_REQUESTS_PER_DEVICE) {
        return new Response(
          JSON.stringify({ success: false, reason: "Thiết bị đã đạt giới hạn gửi yêu cầu quên mật khẩu (tối đa 3 lần)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if email exists in auth.users
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        return new Response(
          JSON.stringify({ error: "Lỗi hệ thống" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailExists = users.users.some(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!emailExists) {
        return new Response(
          JSON.stringify({ success: false, reason: "Email không tồn tại trong hệ thống" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for existing pending request with same email
      const { data: existing } = await supabaseAdmin
        .from("password_reset_requests")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ success: false, reason: "Đã có yêu cầu đang chờ xử lý cho email này" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert request
      const { error: insertError } = await supabaseAdmin
        .from("password_reset_requests")
        .insert({
          email: email.toLowerCase(),
          phone: phone || null,
          device_hash,
        });

      if (insertError) {
        return new Response(
          JSON.stringify({ error: "Không thể gửi yêu cầu" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ LIST REQUESTS (Admin only) ============
    if (action === "list-requests") {
      // Verify admin
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { search } = body;
      let query = supabaseAdmin
        .from("password_reset_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`email.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ RESET PASSWORD (Admin only) ============
    if (action === "reset-password") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { request_id, new_password, email } = body;
      if (!request_id || !new_password || !email) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find user by email
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const targetUser = users.users.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!targetUser) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUser.id,
        { password: new_password }
      );

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark request as resolved
      await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", request_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

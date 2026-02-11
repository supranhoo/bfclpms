import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateSecurePassword(length = 14): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + symbols;

  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);

  // Ensure at least one of each category
  const password = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    password.push(all[arr[i] % all.length]);
  }

  // Shuffle
  for (let i = password.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_ids, send_email } = await req.json();

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, employee_code")
      .in("id", user_ids);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ error: "No matching users found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get app settings for email branding
    const { data: appSettings } = await supabaseAdmin
      .from("app_settings")
      .select("app_name")
      .limit(1)
      .single();

    const appName = appSettings?.app_name || "Performance Management System";

    const results: Array<{
      user_id: string;
      email: string;
      status: string;
      error_message?: string;
      email_sent: boolean;
      email_error?: string;
    }> = [];

    for (const profile of profiles) {
      let status = "success";
      let errorMessage: string | undefined;
      let emailSent = false;
      let emailError: string | undefined;

      try {
        const password = generateSecurePassword(14);

        // Update auth password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          profile.id,
          { password }
        );

        if (updateError) {
          throw new Error(`Auth update failed: ${updateError.message}`);
        }

        // Send email if requested
        if (send_email && profile.email) {
          try {
            const emailBody = {
              event_type: "password_rollout",
              recipient_email: profile.email,
              recipient_name: profile.full_name || "User",
              generated_password: password,
              login_email: profile.email,
              employee_code: profile.employee_code || "",
              app_name: appName,
            };

            const emailResponse = await fetch(
              `${supabaseUrl}/functions/v1/send-email-notification`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify(emailBody),
              }
            );

            if (!emailResponse.ok) {
              const errText = await emailResponse.text();
              throw new Error(`Email dispatch failed: ${errText}`);
            }

            emailSent = true;
          } catch (e: any) {
            emailError = e.message;
            console.error(`Email failed for ${profile.email}:`, e.message);
          }
        }
      } catch (e: any) {
        status = "failed";
        errorMessage = e.message;
        console.error(`Password rollout failed for ${profile.id}:`, e.message);
      }

      // Log to audit table
      await supabaseAdmin.from("password_rollout_logs").insert({
        user_id: profile.id,
        employee_code: profile.employee_code,
        full_name: profile.full_name,
        email: profile.email,
        generated_by: user.id,
        email_sent: emailSent,
        email_error: emailError || null,
        status,
        error_message: errorMessage || null,
      });

      results.push({
        user_id: profile.id,
        email: profile.email,
        status,
        error_message: errorMessage,
        email_sent: emailSent,
        email_error: emailError,
      });
    }

    const summary = {
      total: results.length,
      succeeded: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      details: results,
    };

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Password rollout error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

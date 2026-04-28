import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdminUser } from "../_shared/admin-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5;

function generateSecurePassword(length = 14): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()-_=+";
  const all = upper + lower + digits + symbols;

  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);

  const password = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];

  for (let i = 4; i < length; i++) {
    password.push(all[arr[i] % all.length]);
  }

  for (let i = password.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join("");
}

interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
}

interface UserResult {
  user_id: string;
  email: string;
  status: string;
  error_message?: string;
  email_sent: boolean;
  email_error?: string;
  auth_action?: "updated" | "created";
}

async function processOneUser(
  profile: ProfileRecord,
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  sendEmail: boolean,
  generatedBy: string,
  appName: string,
): Promise<UserResult> {
  let status = "success";
  let errorMessage: string | undefined;
  let emailSent = false;
  let emailError: string | undefined;
  let authAction: "updated" | "created" = "updated";

  try {
    const password = generateSecurePassword(14);

    // Check if auth user exists for this profile id
    const { data: existing, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);

    const userMissing =
      !existing?.user ||
      (getErr && /not.?found/i.test(getErr.message || ""));

    if (userMissing) {
      // Auto-provision: profile exists but auth.users record is missing
      // (typical for employees imported via master backfill before first login).
      if (!profile.email) {
        throw new Error(
          "Cannot provision auth account: profile has no email address."
        );
      }

      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        id: profile.id,
        email: profile.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: profile.full_name,
          employee_code: profile.employee_code,
        },
      });

      if (createErr) {
        const msg = createErr.message || "";
        if (/already.*registered|already.*exist|duplicate/i.test(msg)) {
          throw new Error(
            `Email already linked to a different auth account: ${msg}`
          );
        }
        if (/database error creating new user/i.test(msg)) {
          // Almost always caused by a side-effect trigger on auth.users
          // (e.g. handle_new_user) raising on duplicate keys when the
          // profile already exists. See POLICY §114 / BUG-045.
          throw new Error(
            `Auth provisioning failed (DB trigger error): ${msg}. ` +
              `If this is a backfilled employee, ensure handle_new_user() ` +
              `uses ON CONFLICT DO NOTHING for profiles and user_roles.`
          );
        }
        throw new Error(`Auth provisioning failed: ${msg}`);
      }
      authAction = "created";
    } else {
      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
      if (updateError) {
        throw new Error(`Auth update failed: ${updateError.message}`);
      }
      authAction = "updated";
    }

    if (sendEmail && profile.email) {
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
  try {
    await supabaseAdmin.from("password_rollout_logs").insert({
      user_id: profile.id,
      employee_code: profile.employee_code,
      full_name: profile.full_name,
      email: profile.email,
      generated_by: generatedBy,
      email_sent: emailSent,
      email_error: emailError || null,
      status,
      error_message: errorMessage || null,
    });
  } catch (logErr: any) {
    console.error(`Audit log failed for ${profile.id}:`, logErr.message);
  }

  return {
    user_id: profile.id,
    email: profile.email,
    status,
    error_message: errorMessage,
    email_sent: emailSent,
    email_error: emailError,
    auth_action: status === "success" ? authAction : undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify admin identity via shared helper
    const auth = await requireAdminUser(req);
    if (!auth.authorized || !auth.adminClient) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status || 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = auth.adminClient;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 2. Parse and validate request body
    const { user_ids, send_email } = await req.json();

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const { data: appSettings } = await supabaseAdmin
      .from("app_settings")
      .select("app_name")
      .limit(1)
      .single();

    const appName = appSettings?.app_name || "Performance Management System";

    // Process in batches of 5 for parallel execution
    const results: UserResult[] = [];

    for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
      const batch = profiles.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((profile) =>
          processOneUser(
            profile as ProfileRecord,
            supabaseAdmin,
            supabaseUrl,
            serviceRoleKey,
            !!send_email,
            auth.user!.id,
            appName,
          )
        )
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          console.error("Unexpected batch rejection:", result.reason);
        }
      }
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

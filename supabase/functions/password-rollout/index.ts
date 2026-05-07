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
  email: string | null;
  employee_code: string | null;
  has_real_email?: boolean;
}

const SYNTHETIC_EMAIL_DOMAIN = "noemail.bfclpms.local";

function buildSyntheticEmail(employeeCode: string | null, profileId: string): string {
  const sanitized = (employeeCode || profileId)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const handle = sanitized || `user-${profileId.slice(0, 8)}`;
  return `${handle}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

interface UserResult {
  user_id: string;
  email: string;
  status: string;
  error_message?: string;
  email_sent: boolean;
  email_error?: string;
  auth_action?: "updated" | "created" | "created_no_email";
  has_real_email?: boolean;
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
  let hasRealEmail = profile.has_real_email !== false && !!profile.email;
  let resolvedEmail = profile.email || "";

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
      // If profile has no email -> mint a SYNTHETIC address under the reserved
      // non-routable domain. User logs in via Employee Code; nothing is ever
      // delivered to the synthetic address.
      const usingSynthetic = !profile.email;
      if (usingSynthetic) {
        resolvedEmail = buildSyntheticEmail(profile.employee_code, profile.id);
        hasRealEmail = false;
      } else {
        resolvedEmail = profile.email!;
        hasRealEmail = true;
      }

      const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
        id: profile.id,
        email: resolvedEmail,
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
      authAction = usingSynthetic ? "created_no_email" : "created";

      // Sync the flag onto the profile so app code can rely on it.
      await supabaseAdmin
        .from("profiles")
        .update({ has_real_email: hasRealEmail })
        .eq("id", profile.id);

      // Audit trail (append-only)
      await supabaseAdmin.from("email_change_audit").insert({
        user_id: profile.id,
        old_email: null,
        new_email: resolvedEmail,
        performed_by: generatedBy,
        source: "password_rollout",
      });
    } else {
      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(profile.id, { password });
      if (updateError) {
        throw new Error(`Auth update failed: ${updateError.message}`);
      }
      authAction = "updated";
      // existing user — derive hasRealEmail from current auth email
      const currentEmail = existing!.user!.email || "";
      hasRealEmail = !!currentEmail && !currentEmail.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)
        && !currentEmail.toLowerCase().endsWith("@placeholder-pms.com");
      resolvedEmail = currentEmail;
    }

    // Only send email when user has a real, deliverable address.
    if (sendEmail && hasRealEmail && profile.email) {
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

        // IMPORTANT: Lovable Cloud rejects requests where `Authorization` and
        // `apikey` carry different keys ("Conflicting API keys"). Send the
        // anon/publishable key in BOTH headers so the gateway accepts the call
        // and `send-email-notification`'s validateCaller authorizes via the
        // matching anon key path.
        const anonKey =
          Deno.env.get("SUPABASE_ANON_KEY") ??
          Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
          serviceRoleKey;
        const emailResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-email-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
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
    } else if (sendEmail && !hasRealEmail) {
      // Explicit, non-silent skip — surfaced in result so admin sees why no email was sent.
      emailError = "skipped:no_real_email (user logs in via Employee Code; share password manually)";
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
      email: resolvedEmail || profile.email,
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
    email: resolvedEmail || profile.email || "",
    status,
    error_message: errorMessage,
    email_sent: emailSent,
    email_error: emailError,
    auth_action: status === "success" ? authAction : undefined,
    has_real_email: hasRealEmail,
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
      .select("id, full_name, email, employee_code, has_real_email")
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

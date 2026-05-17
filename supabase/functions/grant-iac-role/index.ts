// Edge function: grant-iac-role
// Auto-provisions auth.users for backfilled profiles before inserting
// into iac_user_role_assignments (whose user_id FK -> auth.users).
// Mirrors the pattern of grant-safety-role.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdminUser } from "../_shared/admin-auth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYNTHETIC_EMAIL_DOMAIN = "noemail.bfclpms.local";

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function buildSyntheticEmail(employeeCode: string | null, profileId: string): string {
  const sanitized = (employeeCode || profileId).toLowerCase().replace(/[^a-z0-9]/g, "");
  const handle = sanitized || `user-${profileId.slice(0, 8)}`;
  return `${handle}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = await requireAdminUser(req);
    if (!auth.authorized || !auth.adminClient || !auth.user) {
      return json({ error: auth.error ?? "Unauthorized" }, auth.status ?? 401);
    }
    const admin = auth.adminClient;

    const body = await req.json().catch(() => ({}));
    const { user_id, role_id, scope_type, scope_id, expires_at } = body ?? {};
    if (!user_id || typeof user_id !== "string") return json({ error: "user_id is required" }, 400);
    if (!role_id || typeof role_id !== "string") return json({ error: "role_id is required" }, 400);

    // Load target profile
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, email, full_name, employee_code, has_real_email, is_active")
      .eq("id", user_id)
      .maybeSingle();
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profile) return json({ error: "Target profile not found" }, 404);
    if (profile.is_active === false) return json({ error: "Target user is deactivated" }, 409);

    // Auto-provision auth.users if missing
    let authAction: "created" | "created_no_email" | "existing" = "existing";
    const { data: existing } = await admin.auth.admin.getUserById(profile.id);
    if (!existing?.user) {
      const usingSynthetic = !profile.email || profile.has_real_email === false;
      const resolvedEmail = usingSynthetic
        ? buildSyntheticEmail(profile.employee_code, profile.id)
        : profile.email!;

      const { error: cErr } = await admin.auth.admin.createUser({
        id: profile.id,
        email: resolvedEmail,
        password: randomPassword(16),
        email_confirm: true,
        user_metadata: {
          full_name: profile.full_name ?? "",
          employee_code: profile.employee_code ?? "",
        },
      });
      if (cErr) {
        return json({ error: `Auth provisioning failed: ${cErr.message}` }, 500);
      }

      await admin
        .from("profiles")
        .update({ has_real_email: !usingSynthetic, portal_access: true })
        .eq("id", profile.id);

      authAction = usingSynthetic ? "created_no_email" : "created";
    }

    // Insert the IAC assignment
    const { error: iErr } = await admin.from("iac_user_role_assignments").insert({
      user_id: profile.id,
      role_id,
      scope_type: scope_type ?? "global",
      scope_id: scope_id ?? null,
      expires_at: expires_at ?? null,
      assigned_by: auth.user.id,
    });
    if (iErr) {
      // Surface unique-violation in a friendly way
      if (/duplicate key|unique/i.test(iErr.message)) {
        return json({ error: "This role is already assigned to the user." }, 409);
      }
      return json({ error: iErr.message }, 500);
    }

    // Audit (best-effort)
    try {
      await admin.rpc("iac_log", {
        _action: "assignment.grant",
        _target_type: "assignment",
        _target_id: `${profile.id}:${role_id}`,
        _payload: {
          user_id: profile.id,
          role_id,
          scope_type: scope_type ?? "global",
          scope_id: scope_id ?? null,
          expires_at: expires_at ?? null,
          auth_action: authAction,
        } as never,
      });
    } catch (_) {
      // ignore audit failure
    }

    return json({ ok: true, auth_action: authAction, user_id: profile.id, role_id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

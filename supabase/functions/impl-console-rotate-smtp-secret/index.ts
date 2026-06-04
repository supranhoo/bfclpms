import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const client_id = String(body?.client_id ?? "");
    const secret = String(body?.secret ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(client_id)) return json({ error: "invalid_client_id" }, 400);
    if (secret.length < 8 || secret.length > 2048) return json({ error: "invalid_secret_length" }, 400);

    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    // Authorization: platform_owner OR assigned implementer
    const [{ data: ownerRow }, { data: assignRow }] = await Promise.all([
      svc.from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_owner").maybeSingle(),
      svc.from("client_implementer_assignments").select("id").eq("user_id", user.id).eq("client_id", client_id).maybeSingle(),
    ]);
    if (!ownerRow && !assignRow) return json({ error: "forbidden" }, 403);

    const { data: client, error: cerr } = await svc
      .from("clients").select("id, client_key").eq("id", client_id).maybeSingle();
    if (cerr || !client) return json({ error: "client_not_found" }, 404);

    // Existing row (for audit before-state)
    const { data: existing } = await svc
      .from("client_smtp_config")
      .select("secret_set_at, secret_fingerprint, secret_ref")
      .eq("client_id", client_id).maybeSingle();

    const hash = await sha256Hex(secret);
    const fingerprint = hash.slice(0, 8);
    const secret_ref = `client_smtp::${client_id}`;
    const now = new Date().toISOString();

    // Store secret bytes in system_settings (service-role only readable; never returned by this function).
    const { error: secErr } = await svc.from("system_settings").upsert(
      {
        setting_key: secret_ref,
        setting_value: secret,
        description: `Per-client SMTP secret for client ${client.client_key}`,
      },
      { onConflict: "setting_key" },
    );
    if (secErr) {
      console.error("secret store failed");
      return json({ error: "secret_store_failed" }, 500);
    }

    // Update metadata table (upsert in case row doesn't exist yet)
    const { error: metaErr } = await svc.from("client_smtp_config").upsert(
      {
        client_id,
        secret_ref,
        secret_set_at: now,
        secret_fingerprint: fingerprint,
        updated_by: user.id,
        updated_at: now,
      },
      { onConflict: "client_id" },
    );
    if (metaErr) {
      console.error("smtp meta update failed");
      return json({ error: "metadata_update_failed" }, 500);
    }

    // Audit (no secret value, no secret_ref)
    await svc.from("entitlement_audit").insert({
      actor_id: user.id,
      event_type: "update",
      entity_type: "client_smtp",
      entity_key: client.client_key,
      client_id,
      before: { secret_set_at: existing?.secret_set_at ?? null, fingerprint: existing?.secret_fingerprint ?? null },
      after: { secret_set_at: now, fingerprint },
      reason: "impl_console_secret_rotate_client_smtp",
    });

    return json({ ok: true, secret_set_at: now, secret_fingerprint: fingerprint });
  } catch (e: any) {
    console.error("rotate error", e?.name ?? "unknown");
    return json({ error: "internal_error" }, 500);
  }
});
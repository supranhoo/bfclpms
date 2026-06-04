/**
 * Phase 4C — Retention sweeper (PREVIEW-ONLY in this phase).
 *
 * Platform-owner gated. Returns a count + oldest/newest timestamps of rows
 * that WOULD be deleted under a retention policy scoped strictly to test-send
 * audit rows. No DELETE is performed in this phase regardless of input.
 *
 * Reason allowlist (HARD-CODED — never widen without explicit approval):
 *   reason = 'impl_console_test_email_send_client_smtp'
 *   entity_type = 'client_smtp'
 *   event_type = 'update'
 *
 * Never touches grant / revoke / assign / unassign / would_deny / deny /
 * export / role / assignment rows.
 *
 * Out of scope: actual DELETE (separate future approval), cron schedule,
 * PMS surfaces, RLS edits.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MIN_RETENTION_DAYS = 90; // per safety-directives + user mandate
const SCOPE_REASON = "impl_console_test_email_send_client_smtp";
const SCOPE_ENTITY_TYPE = "client_smtp";
const SCOPE_EVENT_TYPE = "update";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
  const callerId = userRes.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Re-verify platform_owner server-side (defense in depth — never trust client).
  const { data: ownerRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "platform_owner")
    .maybeSingle();
  if (!ownerRow) return json({ error: "Platform owner access required" }, 403);

  let body: { action?: string; retention_days?: number; client_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action;
  const retentionDays = Number(body.retention_days);
  const clientId = body.client_id || null;

  if (!Number.isFinite(retentionDays) || retentionDays < MIN_RETENTION_DAYS) {
    return json(
      { error: `retention_days must be >= ${MIN_RETENTION_DAYS}` },
      400,
    );
  }

  // Preview-only this phase. Any other action is rejected.
  if (action !== "preview") {
    return json(
      {
        error:
          "Only action='preview' is enabled in this phase. Execute/delete requires separate platform-owner approval.",
      },
      403,
    );
  }

  const cutoffIso = new Date(Date.now() - retentionDays * 86_400_000).toISOString();

  // Count rows in scope (head: true → cheap count, no payload).
  let countQ = admin
    .from("entitlement_audit")
    .select("id", { count: "exact", head: true })
    .eq("event_type", SCOPE_EVENT_TYPE)
    .eq("entity_type", SCOPE_ENTITY_TYPE)
    .eq("reason", SCOPE_REASON)
    .lt("created_at", cutoffIso);
  if (clientId) countQ = countQ.eq("client_id", clientId);
  const { count, error: countErr } = await countQ;
  if (countErr) return json({ error: countErr.message }, 500);

  // Oldest / newest timestamps in scope (single-row reads, cheap).
  let oldestQ = admin
    .from("entitlement_audit")
    .select("created_at")
    .eq("event_type", SCOPE_EVENT_TYPE)
    .eq("entity_type", SCOPE_ENTITY_TYPE)
    .eq("reason", SCOPE_REASON)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(1);
  if (clientId) oldestQ = oldestQ.eq("client_id", clientId);

  let newestQ = admin
    .from("entitlement_audit")
    .select("created_at")
    .eq("event_type", SCOPE_EVENT_TYPE)
    .eq("entity_type", SCOPE_ENTITY_TYPE)
    .eq("reason", SCOPE_REASON)
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(1);
  if (clientId) newestQ = newestQ.eq("client_id", clientId);

  const [{ data: oldestRows }, { data: newestRows }] = await Promise.all([oldestQ, newestQ]);

  return json({
    mode: "preview",
    would_delete: count ?? 0,
    cutoff_iso: cutoffIso,
    retention_days: retentionDays,
    client_id: clientId,
    scope: {
      event_type: SCOPE_EVENT_TYPE,
      entity_type: SCOPE_ENTITY_TYPE,
      reason: SCOPE_REASON,
    },
    oldest_iso: oldestRows?.[0]?.created_at ?? null,
    newest_iso: newestRows?.[0]?.created_at ?? null,
    note:
      "DELETE is intentionally disabled in this phase. Enabling requires separate platform-owner approval, typed confirmation, and a pre-delete export.",
  });
});
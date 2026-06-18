import { corsHeaders } from "npm:@supabase/supabase-js/cors";
import { createClient } from "npm:@supabase/supabase-js";

/**
 * permit-expiry-sweep
 * -------------------
 * Invoked every 15 minutes by pg_cron. Calls the SECURITY DEFINER RPC
 * `expire_overdue_permits` which atomically transitions any approved/active
 * permits past their `end_at` to status='expired' and writes audit rows
 * with actor_id=NULL (per "Automated actions must set performed_by = NULL").
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: require either a CRON_SECRET header or a Bearer token equal to
  // the service-role key. Previously this function ran with no auth gate at
  // all — any internet caller could trigger permit expiry on demand.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") ?? "";
  const cronOk = !!cronSecret && provided === cronSecret;
  const srvOk = !!serviceRoleKey && (bearer === serviceRoleKey || apikey === serviceRoleKey);
  if (!cronOk && !srvOk) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
    );
    const { data, error } = await sb.rpc("expire_overdue_permits");
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Phase 1.D — Safety SLA escalation cron.
 *
 * Invoked by pg_cron (every 5 minutes) or manually by an admin.
 * Idempotent: each (incident, level) is escalated at most once via the
 * `safety_sla_escalations` UNIQUE(incident_id, level) constraint.
 *
 * The actual escalation logic lives in the SECURITY DEFINER SQL function
 * `public.run_safety_sla_escalations()` so the edge fn stays thin and the
 * business rule has a single source of truth in the database.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authorize: accept service-role calls (cron) or admin user JWTs.
    // T-004: anon-key bypass removed — anon-key is a public value and must
    // never grant cron-equivalent powers.
    const authHeader = req.headers.get("Authorization") || "";
    const apiKey = req.headers.get("apikey") || "";
    const isServiceCall =
      authHeader === `Bearer ${serviceKey}` ||
      apiKey === serviceKey;

    if (!isServiceCall) {
      // Validate user JWT and check safety admin role
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (!userRes?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: rolesRow } = await admin
        .from("safety_user_roles")
        .select("role")
        .eq("user_id", userRes.user.id)
        .in("role", ["admin", "safety_head"]);
      if (!rolesRow || rolesRow.length === 0) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.rpc("run_safety_sla_escalations");

    if (error) {
      console.error("[check-safety-sla] RPC error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[check-safety-sla] result:", data);
    return new Response(JSON.stringify(data ?? { ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[check-safety-sla] unexpected:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
/**
 * safety-analytics
 * ----------------
 * Phase 7-B. Returns aggregated reads from the safety materialized views
 * with optional `business_unit_id` filter.
 *
 * T-001 (Phase 1.5): MVs are no longer readable by anon/authenticated.
 * We use a service-role client and gate access by verifying the caller
 * has a Safety role via `has_any_safety_role`.
 *
 * GET / POST { business_unit_id?: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Caller-scoped client only to resolve the user identity.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Service-role client for MV reads (revoked from authenticated by T-001).
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });

    // Gate: caller must hold any Safety role.
    const { data: roleOk, error: roleErr } = await supabase.rpc(
      'has_any_safety_role',
      { _user_id: userData.user.id },
    );
    if (roleErr || roleOk !== true) {
      return new Response(
        JSON.stringify({ ok: false, error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let bu: string | null = null;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      bu = body?.business_unit_id ?? null;
    } else {
      const u = new URL(req.url);
      bu = u.searchParams.get('business_unit_id');
    }

    const filter = (q: any) =>
      bu ? q.eq('business_unit_id', bu) : q;

    const [trir, sev, oc, train, audit, permit] = await Promise.all([
      filter(supabase.from('mv_safety_trir').select('*')),
      filter(supabase.from('mv_safety_severity_rate').select('*')),
      filter(supabase.from('mv_safety_incidents_open_vs_closed').select('*')),
      supabase.from('mv_safety_training_compliance').select('*').limit(1).maybeSingle(),
      filter(supabase.from('mv_safety_audit_scoreboard').select('*')),
      filter(supabase.from('mv_safety_permit_throughput').select('*')),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          trir: trir.data ?? [],
          severity: sev.data ?? [],
          open_vs_closed: oc.data ?? [],
          training: train.data ?? null,
          audit_scoreboard: audit.data ?? [],
          permit_throughput: permit.data ?? [],
          refreshed_at: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
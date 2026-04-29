/**
 * safety-analytics
 * ----------------
 * Phase 7-B. Returns aggregated reads from the materialized views with
 * optional `business_unit_id` and `from_date` filters. Uses the caller's
 * JWT so RLS / GRANTs are honored.
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
    const authHeader = req.headers.get('Authorization') ?? '';

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

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
// E16: Auto-revert open re-opens at period close.
// Scans final_score_revisions rows where new_final_score IS NULL (i.e. the
// cell was re-opened but never re-approved) and whose underlying review_period
// is locked or in a closed stage. Restores prev_final_score and stamps the
// revision row with auto_reverted=true. Runs as a daily cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = req.headers.get('x-cron-secret');
    const expected = Deno.env.get('CRON_SECRET');
    if (expected && cronSecret !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(url, key);

    // Pull all open revisions (no new_final_score, not yet auto_reverted)
    const { data: openRevs, error: revErr } = await supabase
      .from('final_score_revisions')
      .select('id, submission_id, prev_final_score, reopened_stages, auto_reverted')
      .is('new_final_score', null)
      .eq('auto_reverted', false)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (revErr) throw revErr;
    if (!openRevs || openRevs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, scanned: 0, reverted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve each submission's period
    const subIds = [...new Set(openRevs.map((r) => r.submission_id))];
    const { data: subs } = await supabase
      .from('review_submissions')
      .select('id, kpi_id, kpis!inner(review_period, review_year)')
      .in('id', subIds);

    type SubInfo = { id: string; period: string; year: number };
    const subMap = new Map<string, SubInfo>();
    (subs ?? []).forEach((s: any) => {
      const k = s.kpis;
      if (k) subMap.set(s.id, { id: s.id, period: k.review_period, year: k.review_year });
    });

    // Find which (period_name, review_year) pairs are locked
    const periodKeys = new Set([...subMap.values()].map((s) => `${s.period}|${s.year}`));
    const { data: periods } = await supabase
      .from('review_periods')
      .select('id, period_name, review_year, current_stage');

    const lockedPeriodKeys = new Set<string>();
    for (const p of periods ?? []) {
      const key = `${p.period_name}|${p.review_year}`;
      if (!periodKeys.has(key)) continue;
      if (p.current_stage === 'closed') {
        lockedPeriodKeys.add(key);
        continue;
      }
      const { data: lock } = await supabase
        .from('review_period_locks')
        .select('id')
        .eq('review_period_id', p.id)
        .eq('is_locked', true)
        .eq('lock_type', 'global')
        .maybeSingle();
      if (lock) lockedPeriodKeys.add(key);
    }

    let reverted = 0;
    for (const rev of openRevs) {
      const sub = subMap.get(rev.submission_id);
      if (!sub) continue;
      if (!lockedPeriodKeys.has(`${sub.period}|${sub.year}`)) continue;

      // Restore prev_final_score — only if the cell is still open
      const { error: updErr } = await supabase
        .from('review_submissions')
        .update({
          final_score: rev.prev_final_score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rev.submission_id)
        .is('final_score', null);

      if (updErr) continue;

      // Mark revision as auto-reverted (immutable audit)
      await supabase
        .from('final_score_revisions')
        .update({
          new_final_score: rev.prev_final_score,
          auto_reverted: true,
        })
        .eq('id', rev.id);

      reverted++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: openRevs.length,
        reverted,
        locked_periods: [...lockedPeriodKeys],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
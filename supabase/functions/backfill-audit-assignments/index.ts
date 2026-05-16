import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdminUser } from '../_shared/admin-auth.ts';
import { planBackfill, PlannerKpi, PlannerPeriod, PlannerSummary, periodOrderKey } from './planner.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BackfillRequest {
  targets: PlannerPeriod[]; // e.g. [{year:2026,period:'April'}]
  dry_run: boolean;
  /**
   * Optional override: only consider source KPIs from these periods.
   * Defaults to "every period strictly earlier than the target".
   */
  source_periods?: PlannerPeriod[];
}

const PAGE_SIZE = 1000;

async function fetchAllKpis(
  supabase: ReturnType<typeof createClient>,
  filter: { year: number; period: string },
): Promise<PlannerKpi[]> {
  const out: PlannerKpi[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kpis')
      .select('id, employee_id, review_year, review_period, kra_name, kpi_name')
      .eq('review_year', filter.year)
      .eq('review_period', filter.period)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Fetch kpis ${filter.year}/${filter.period}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as PlannerKpi[]));
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

async function fetchExistingAssignments(
  supabase: ReturnType<typeof createClient>,
  kpiIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < kpiIds.length; i += 200) {
    const chunk = kpiIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('audit_kpi_level_assignments')
      .select('kpi_id, auditor_id')
      .in('kpi_id', chunk);
    if (error) throw new Error(`Fetch audit assignments: ${error.message}`);
    for (const r of (data as Array<{ kpi_id: string; auditor_id: string }> | null) || []) {
      out.set(r.kpi_id, r.auditor_id);
    }
  }
  return out;
}

async function listAllKpiPeriods(
  supabase: ReturnType<typeof createClient>,
): Promise<PlannerPeriod[]> {
  // Distinct (review_year, review_period) tuples currently in kpis table.
  // We rely on PostgREST's distinct via a small RPC-free trick: just SELECT and dedupe in JS.
  const seen = new Set<string>();
  const out: PlannerPeriod[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('kpis')
      .select('review_year, review_period')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`List periods: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ review_year: number; review_period: string }>) {
      const key = `${r.review_year}|${r.review_period}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ year: r.review_year, period: r.review_period });
      }
    }
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Admin gate
  const auth = await requireAdminUser(req);
  if (!auth.authorized || !auth.adminClient) {
    return new Response(
      JSON.stringify({ error: auth.error ?? 'Unauthorized' }),
      { status: auth.status ?? 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: BackfillRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!Array.isArray(body.targets) || body.targets.length === 0) {
    return new Response(
      JSON.stringify({ error: '`targets` must be a non-empty array of { year, period }' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (typeof body.dry_run !== 'boolean') {
    return new Response(
      JSON.stringify({ error: '`dry_run` is required (boolean)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = auth.adminClient;
  const summaries: PlannerSummary[] = [];
  let totalInserted = 0;
  const errors: string[] = [];

  try {
    // Discover candidate source periods once.
    const allPeriods = body.source_periods?.length
      ? body.source_periods
      : await listAllKpiPeriods(supabase);

    for (const target of body.targets) {
      const targetKey = periodOrderKey(target);
      const candidatePeriods = allPeriods.filter((p) => periodOrderKey(p) < targetKey);

      const targetKpis = await fetchAllKpis(supabase, target);
      if (targetKpis.length === 0) {
        summaries.push({
          target,
          target_kpi_count: 0,
          would_create: 0,
          already_mapped: 0,
          no_source_match: 0,
          source_has_no_auditor: 0,
          rows: [],
        });
        continue;
      }

      const existing = await fetchExistingAssignments(
        supabase,
        targetKpis.map((k) => k.id),
      );
      const alreadyAssigned = new Set(existing.keys());

      // Pull source KPIs per candidate period (descending recency).
      const sortedPeriods = [...candidatePeriods].sort(
        (a, b) => periodOrderKey(b) - periodOrderKey(a),
      );
      const candidateSourceKpisByPeriod: Array<{ period: PlannerPeriod; kpis: PlannerKpi[] }> = [];
      const allSourceIds: string[] = [];
      for (const p of sortedPeriods) {
        const kpis = await fetchAllKpis(supabase, p);
        candidateSourceKpisByPeriod.push({ period: p, kpis });
        for (const k of kpis) allSourceIds.push(k.id);
      }

      const sourceAuditorByKpiId = await fetchExistingAssignments(supabase, allSourceIds);

      const summary = planBackfill({
        target,
        targetKpis,
        alreadyAssignedTargetKpiIds: alreadyAssigned,
        candidateSourceKpisByPeriod,
        sourceAuditorByKpiId,
      });
      summaries.push(summary);

      if (!body.dry_run && summary.rows.length > 0) {
        const rowsToUpsert = summary.rows.map((r) => ({
          kpi_id: r.kpi_id,
          auditor_id: r.auditor_id,
          assigned_by: null,
        }));
        for (let i = 0; i < rowsToUpsert.length; i += 500) {
          const batch = rowsToUpsert.slice(i, i + 500);
          const { error, count } = await supabase
            .from('audit_kpi_level_assignments')
            .upsert(batch, { onConflict: 'kpi_id', ignoreDuplicates: true, count: 'exact' });
          if (error) {
            errors.push(`Upsert (${target.year}/${target.period}): ${error.message}`);
            continue;
          }
          totalInserted += count ?? 0;
        }
      }
    }

    if (!body.dry_run) {
      try {
        await supabase.from('system_audit_logs').insert({
          action: 'AUDIT_ASSIGNMENTS_BACKFILLED',
          performed_by: null,
          metadata: {
            triggered_by: auth.user?.email ?? auth.user?.id ?? 'admin',
            targets: body.targets,
            source_periods: body.source_periods ?? 'auto',
            total_inserted: totalInserted,
            errors,
            summaries: summaries.map((s) => ({
              target: s.target,
              target_kpi_count: s.target_kpi_count,
              would_create: s.would_create,
              already_mapped: s.already_mapped,
              no_source_match: s.no_source_match,
              source_has_no_auditor: s.source_has_no_auditor,
            })),
          },
        });
      } catch (logErr) {
        console.error('audit log insert failed:', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: body.dry_run,
        total_inserted: totalInserted,
        errors,
        summaries,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[backfill-audit-assignments] failed:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
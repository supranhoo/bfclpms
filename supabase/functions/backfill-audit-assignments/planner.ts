/**
 * Pure planner for backfilling audit_kpi_level_assignments.
 *
 * Given target-period KPIs, prior-period source KPIs, the auditor mapping that
 * exists on each source KPI, and the set of target KPIs that already have an
 * assignment, produces:
 *   - rows to upsert (kpi_id + auditor_id) for newly assignable target KPIs
 *   - a per-period summary breakdown
 *
 * Matching rule: signature = `${employee_id}|${kra_name}|${kpi_name}`.
 * For each target KPI, walk the candidate source periods from MOST RECENT
 * PRIOR period downward and pick the first source whose source-KPI has an
 * auditor assignment.
 *
 * Pure (no IO) — exported so both the edge function and the vitest suite can
 * exercise the same logic.
 */

export interface PlannerKpi {
  id: string;
  employee_id: string;
  review_year: number;
  review_period: string; // month name e.g. "April"
  kra_name: string;
  kpi_name: string;
}

export interface PlannerPeriod {
  year: number;
  period: string;
}

export interface PlannerInput {
  target: PlannerPeriod;
  targetKpis: PlannerKpi[];
  /** All target KPI ids that already have a row in audit_kpi_level_assignments */
  alreadyAssignedTargetKpiIds: Set<string>;
  /**
   * Candidate source KPIs from periods strictly EARLIER than target, in
   * descending recency order (most-recent prior first).
   */
  candidateSourceKpisByPeriod: Array<{
    period: PlannerPeriod;
    kpis: PlannerKpi[];
  }>;
  /** kpi_id → auditor_id for every source KPI that has an assignment */
  sourceAuditorByKpiId: Map<string, string>;
}

export interface PlannerRow {
  kpi_id: string;
  auditor_id: string;
  source_kpi_id: string;
  source_period: PlannerPeriod;
}

export interface PlannerSummary {
  target: PlannerPeriod;
  target_kpi_count: number;
  would_create: number;
  already_mapped: number;
  no_source_match: number;
  source_has_no_auditor: number;
  rows: PlannerRow[];
}

const MONTH_IDX: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

export function periodOrderKey(p: PlannerPeriod): number {
  return p.year * 12 + (MONTH_IDX[p.period] ?? 0);
}

export function planBackfill(input: PlannerInput): PlannerSummary {
  const sig = (k: { employee_id: string; kra_name: string; kpi_name: string }) =>
    `${k.employee_id}|${k.kra_name}|${k.kpi_name}`;

  // Build per-period signature → source KPI lookup, preserving recency order.
  const sortedSources = [...input.candidateSourceKpisByPeriod].sort(
    (a, b) => periodOrderKey(b.period) - periodOrderKey(a.period),
  );
  const sourceLookups = sortedSources.map((bucket) => {
    const map = new Map<string, PlannerKpi>();
    for (const k of bucket.kpis) {
      // first-write-wins inside the same period is fine
      if (!map.has(sig(k))) map.set(sig(k), k);
    }
    return { period: bucket.period, map };
  });

  let would_create = 0;
  let already_mapped = 0;
  let no_source_match = 0;
  let source_has_no_auditor = 0;
  const rows: PlannerRow[] = [];

  for (const target of input.targetKpis) {
    if (input.alreadyAssignedTargetKpiIds.has(target.id)) {
      already_mapped++;
      continue;
    }
    const targetSig = sig(target);
    let resolved: { src: PlannerKpi; period: PlannerPeriod } | null = null;
    let sawSourceWithoutAuditor = false;

    for (const bucket of sourceLookups) {
      const candidate = bucket.map.get(targetSig);
      if (!candidate) continue;
      if (input.sourceAuditorByKpiId.has(candidate.id)) {
        resolved = { src: candidate, period: bucket.period };
        break;
      }
      // Source KPI exists for this signature but has no auditor row — keep
      // walking further back; the user may have mapped only in a later period.
      sawSourceWithoutAuditor = true;
    }

    if (resolved) {
      const auditorId = input.sourceAuditorByKpiId.get(resolved.src.id)!;
      rows.push({
        kpi_id: target.id,
        auditor_id: auditorId,
        source_kpi_id: resolved.src.id,
        source_period: resolved.period,
      });
      would_create++;
    } else if (sawSourceWithoutAuditor) {
      source_has_no_auditor++;
    } else {
      no_source_match++;
    }
  }

  return {
    target: input.target,
    target_kpi_count: input.targetKpis.length,
    would_create,
    already_mapped,
    no_source_match,
    source_has_no_auditor,
    rows,
  };
}
/**
 * ADR-252 / POLICY §TNI-CONTINUITY
 *
 * TNI qualification is evaluated at KPI identity level across the whole
 * selected month range: a KPI is a training need only when its score is AT OR
 * BELOW the configured threshold in EVERY scored month of the range.
 *
 * Persisted `training_needs` rows remain the descriptive record (priority,
 * recommendation, status); this module decides which of those rows survive the
 * continuity rule for the selected range. Previously the multi-month report
 * UNIONed per-month detection records (ANY-month semantics), which over-
 * reported by design.
 */

/** Canonical identity of a KPI across months (KRA + KPI name, normalised). */
export function tniKpiKey(kraName?: string | null, kpiName?: string | null): string {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
  return `${norm(kraName)}||${norm(kpiName)}`;
}

export function tniRowKey(employeeId?: string | null, kpiKey?: string | null): string {
  return `${employeeId ?? ''}::${kpiKey ?? ''}`;
}

/**
 * ADR-252c — stamp identifying the exact (month, year) range a qualified
 * result-set was computed for. Any consumer must compare this against the
 * active range before rendering, so a cached/placeholder result from another
 * filter can never be presented as the current one.
 */
export function tniRangeKey(ranges: { month: string; year: number }[] | null | undefined): string {
  return (ranges ?? []).map(r => `${r.month}|${r.year}`).join(',');
}

export interface QualifiedKpiRow {
  employee_id: string;
  kpi_key: string;
  kra_name: string | null;
  kpi_name: string | null;
  months: { month: string; year: number; score: number | null }[];
  scored_months: number;
  worst_score: number | null;
  latest_score: number | null;
}

export type QualifiedIndex = Map<string, QualifiedKpiRow>;

export function buildQualifiedIndex(rows: QualifiedKpiRow[] | null | undefined): QualifiedIndex {
  const map: QualifiedIndex = new Map();
  (rows ?? []).forEach(r => map.set(tniRowKey(r.employee_id, r.kpi_key), r));
  return map;
}

export interface NeedLike {
  employee_id: string;
  kpi?: { kra_name?: string | null; kpi_name?: string | null } | null;
}

/** Lookup helper — returns the qualifying evidence row, or undefined. */
export function qualifiedEvidence(need: NeedLike, index: QualifiedIndex): QualifiedKpiRow | undefined {
  return index.get(tniRowKey(need.employee_id, tniKpiKey(need.kpi?.kra_name, need.kpi?.kpi_name)));
}

/**
 * Keep one row per (employee, KPI identity) — the persisted records repeat per
 * month, but a continuity-qualified training need is a single finding for the
 * whole range. The most recent month's record wins (it carries current status).
 */
export function dedupeNeedsByKpi<T extends NeedLike & { review_year: number; review_period: string }>(
  needs: T[],
  monthOrder: string[],
): T[] {
  const rank = new Map(monthOrder.map((k, i) => [k, i]));
  const best = new Map<string, T>();
  needs.forEach(n => {
    const key = tniRowKey(n.employee_id, tniKpiKey(n.kpi?.kra_name, n.kpi?.kpi_name));
    const cur = best.get(key);
    const r = rank.get(`${n.review_year}|${n.review_period}`) ?? -1;
    const curR = cur ? (rank.get(`${cur.review_year}|${cur.review_period}`) ?? -1) : -Infinity;
    if (!cur || r >= curR) best.set(key, n);
  });
  return Array.from(best.values());
}

/** Apply the continuity rule to persisted rows. */

/** ADR-253 — one report column per filtered month. Header label `MMM YYYY`. */
export function monthColumnLabel(range: { month: string; year: number }): string {
  return `${range.month.slice(0, 3)} ${range.year}`;
}

/**
 * ADR-253 — the achieved score for a single month of the selected range,
 * read from the per-month evidence returned by `tni_qualified_kpis`.
 * Returns null when that month carries no score (rendered as an em dash).
 */
export function scoreForMonth(
  evidence: QualifiedKpiRow | undefined,
  range: { month: string; year: number },
): number | null {
  const hit = evidence?.months?.find(m => m.month === range.month && m.year === range.year);
  return hit?.score == null ? null : Number(hit.score);
}

export function filterQualifiedNeeds<T extends NeedLike & { review_year: number; review_period: string }>(
  needs: T[] | null | undefined,
  index: QualifiedIndex,
  monthOrder: string[],
  opts?: { multiMonth: boolean },
): T[] {
  const kept = (needs ?? []).filter(n => index.has(tniRowKey(n.employee_id, tniKpiKey(n.kpi?.kra_name, n.kpi?.kpi_name))));
  return opts?.multiMonth ? dedupeNeedsByKpi(kept, monthOrder) : kept;
}

/**
 * ADR-254 — the qualification result-set is the report's source of truth.
 *
 * A qualifying (employee, KPI) is reported even when no `training_needs`
 * detection record exists for it (detection is run per month, at whatever
 * threshold was configured that day). Persisted rows only enrich a qualifying
 * row with its descriptive fields; they can never gate it.
 */
export interface TniEmployeeLite {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  is_active: boolean | null;
  department_id: string | null;
  department?: { id: string; name: string } | null;
}

export interface TniDisplayRow {
  id: string;
  employee_id: string;
  kpi_key: string;
  actioned: boolean;
  review_period: string;
  review_year: number;
  score: number | null;
  gap_type: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
  training_recommendation: string | null;
  category_id: string | null;
  category: { id: string; name: string } | null;
  kpi: { kra_name: string | null; kpi_name: string | null; weightage?: number | null } | null;
  employee: TniEmployeeLite | null;
  evidence: QualifiedKpiRow;
}

type MergeableNeed = NeedLike & {
  id: string;
  review_year: number;
  review_period: string;
  score?: number | null;
  gap_type?: string | null;
  priority?: string | null;
  status?: string | null;
  training_recommendation?: string | null;
  category_id?: string | null;
  category?: { id: string; name: string } | null;
  employee?: any;
};

export function mergeQualifiedWithNeeds(
  qualified: QualifiedKpiRow[] | null | undefined,
  needs: MergeableNeed[] | null | undefined,
  monthOrder: string[],
  profiles?: Map<string, TniEmployeeLite> | null,
): TniDisplayRow[] {
  // Latest persisted record per (employee, KPI) — it carries current status.
  const latest = new Map<string, MergeableNeed>();
  const rank = new Map(monthOrder.map((k, i) => [k, i]));
  (needs ?? []).forEach(n => {
    const key = tniRowKey(n.employee_id, tniKpiKey(n.kpi?.kra_name, n.kpi?.kpi_name));
    const cur = latest.get(key);
    const r = rank.get(`${n.review_year}|${n.review_period}`) ?? -1;
    const curR = cur ? (rank.get(`${cur.review_year}|${cur.review_period}`) ?? -1) : -Infinity;
    if (!cur || r >= curR) latest.set(key, n);
  });

  const lastRange = monthOrder[monthOrder.length - 1]?.split('|') ?? [];

  return (qualified ?? []).map(q => {
    const key = tniRowKey(q.employee_id, q.kpi_key);
    const n = latest.get(key);
    const profile = profiles?.get(q.employee_id) ?? (n?.employee as TniEmployeeLite | undefined) ?? null;
    return {
      id: n?.id ?? `qualified:${key}`,
      employee_id: q.employee_id,
      kpi_key: q.kpi_key,
      actioned: !!n,
      review_period: n?.review_period ?? (lastRange[1] ?? ''),
      review_year: n?.review_year ?? Number(lastRange[0] ?? 0),
      score: n?.score ?? q.worst_score ?? null,
      gap_type: (n?.gap_type as string) ?? 'skill',
      priority: ((n?.priority as any) ?? 'high') as 'high' | 'medium' | 'low',
      status: (n?.status as string) ?? 'identified',
      training_recommendation: n?.training_recommendation ?? null,
      category_id: n?.category_id ?? null,
      category: n?.category ?? null,
      kpi: {
        kra_name: n?.kpi?.kra_name ?? q.kra_name,
        kpi_name: n?.kpi?.kpi_name ?? q.kpi_name,
        weightage: (n?.kpi as any)?.weightage ?? null,
      },
      employee: profile,
      evidence: q,
    };
  });
}
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
export function filterQualifiedNeeds<T extends NeedLike & { review_year: number; review_period: string }>(
  needs: T[] | null | undefined,
  index: QualifiedIndex,
  monthOrder: string[],
  opts?: { multiMonth: boolean },
): T[] {
  const kept = (needs ?? []).filter(n => index.has(tniRowKey(n.employee_id, tniKpiKey(n.kpi?.kra_name, n.kpi?.kpi_name))));
  return opts?.multiMonth ? dedupeNeedsByKpi(kept, monthOrder) : kept;
}
/**
 * ADR-208 / POLICY §PIP-KPI-IMPROVEMENT-AREAS
 *
 * Pure helpers for the "low-scoring KPI" picker used by the PIP create form.
 * Never recomputes a score — it only filters and formats the stored
 * `review_submissions.final_score` (universal scoring SSOT).
 *
 * Deliberately exposes NO formula / scoring-logic fields (criteria, r0..r5,
 * target_value): the picker names the KPI and its score, nothing else.
 */

export interface LowScoringKpiRow {
  kpiId: string;
  kraName: string;
  kpiName: string;
  month: string;
  year: number;
  score: number;
}

/** Raw shape returned by the joined query. */
export interface RawKpiScoreRow {
  id: string;
  kra_name: string | null;
  kpi_name: string | null;
  review_period: string | null;
  review_year: number | null;
  final_score: number | string | null;
  is_na: boolean | null;
}

/** `Mon YYYY` short label, matching the trend report. */
export function monthLabel(month: string, year: number): string {
  return `${(month || '').slice(0, 3)} ${year}`;
}

/**
 * Stored form of a KPI-derived improvement area. Kept human-readable so PIP
 * detail views and exports need no extra joins.
 */
export function kpiAreaLabel(row: LowScoringKpiRow): string {
  return `${row.kraName} — ${row.kpiName} (${monthLabel(row.month, row.year)})`;
}

/**
 * Keep rows that are scored (non-null, not N/A) and strictly below the
 * configured PIP threshold. Sorted worst score first, then KRA / KPI name.
 */
export function filterLowScoringKpis(
  rows: RawKpiScoreRow[],
  threshold: number,
): LowScoringKpiRow[] {
  const out: LowScoringKpiRow[] = [];
  for (const r of rows) {
    if (r.is_na) continue;
    if (r.final_score == null) continue;
    const score = Number(r.final_score);
    if (!Number.isFinite(score)) continue;
    if (score >= threshold) continue;
    if (!r.review_period || r.review_year == null) continue;
    out.push({
      kpiId: r.id,
      kraName: r.kra_name || 'Uncategorised KRA',
      kpiName: r.kpi_name || 'Untitled KPI',
      month: r.review_period,
      year: r.review_year,
      score,
    });
  }
  return out.sort(
    (a, b) =>
      a.score - b.score ||
      a.kraName.localeCompare(b.kraName) ||
      a.kpiName.localeCompare(b.kpiName),
  );
}

export interface LowScoringKraGroup {
  kraName: string;
  rows: LowScoringKpiRow[];
}

/** Group by KRA, preserving the worst-score-first ordering within each group. */
export function groupByKra(rows: LowScoringKpiRow[]): LowScoringKraGroup[] {
  const map = new Map<string, LowScoringKpiRow[]>();
  for (const r of rows) {
    const list = map.get(r.kraName);
    if (list) list.push(r);
    else map.set(r.kraName, [r]);
  }
  return [...map.entries()]
    .map(([kraName, groupRows]) => ({ kraName, rows: groupRows }))
    .sort((a, b) => (a.rows[0]?.score ?? 99) - (b.rows[0]?.score ?? 99));
}

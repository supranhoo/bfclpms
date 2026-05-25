/**
 * Pure helpers for Bulk Review row-level (horizontal) selection.
 *
 * A "row" in the matrix grid is a single KPI (kra_name + kpi_name) rendered
 * across many employee columns. The horizontal select handle toggles every
 * selectable cell in that KPI row at once. Stays dependency-free so it is
 * easy to unit-test.
 */

export interface RowLike {
  kra_name: string | null;
  kpi_name: string | null;
  submission_id: string | null;
}

export function kpiRowKey(r: { kra_name: string | null; kpi_name: string | null }): string {
  return `${r.kra_name ?? ''}|${r.kpi_name ?? ''}`;
}

/** All submission ids that belong to the given KPI row (skips unscored cells). */
export function submissionIdsForKpiRow(
  rows: readonly RowLike[],
  rowKey: string,
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (kpiRowKey(r) !== rowKey) continue;
    if (r.submission_id) out.push(r.submission_id);
  }
  return out;
}

/**
 * Toggle a horizontal row: if every selectable cell in that KPI row is already
 * selected, deselect them all; otherwise select all of them. Other selections
 * are preserved.
 */
export function toggleKpiRowSelection(
  prev: ReadonlySet<string>,
  ids: readonly string[],
): Set<string> {
  const next = new Set(prev);
  if (ids.length === 0) return next;
  const allOn = ids.every(id => next.has(id));
  if (allOn) ids.forEach(id => next.delete(id));
  else ids.forEach(id => next.add(id));
  return next;
}
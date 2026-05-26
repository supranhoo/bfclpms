import type { BulkReviewRow } from '@/hooks/useBulkReview';

/**
 * Bulk Review presentation filter.
 *
 * A KPI row is considered "fully processed at the viewer stage" when every
 * visible employee column for that row either:
 *   - has a non-null score in the viewer-stage column, OR
 *   - is marked N/A on that cell (is_na === true).
 *
 * If ANY visible employee for the row is missing a cell entirely, or has
 * neither a stage score nor an N/A flag, the row is considered pending and
 * must stay visible. This guarantees no employee gets "hidden behind"
 * peers who are already done.
 *
 * Pure / UI-only — does not affect selection, RPC payloads, audit, or RLS.
 */
export function isKpiRowFullyProcessed(
  kpiKey: string,
  employeeIds: string[],
  cellMap: ReadonlyMap<string, BulkReviewRow>,
  stageKey: keyof BulkReviewRow,
): boolean {
  if (employeeIds.length === 0) return false; // defensive — keep visible
  for (const empId of employeeIds) {
    const cell = cellMap.get(`${kpiKey}::${empId}`);
    if (!cell) return false;                       // no submission yet → pending
    if (cell.is_na === true) continue;             // N/A counts as processed
    const score = cell[stageKey] as number | null | undefined;
    if (score === null || score === undefined) return false; // pending
  }
  return true;
}
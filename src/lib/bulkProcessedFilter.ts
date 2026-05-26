import type { BulkReviewRow } from '@/hooks/useBulkReview';

/**
 * Bulk Review presentation filter.
 *
 * A KPI row is considered "fully processed at the viewer stage" when every
 * employee actually ASSIGNED this KPI (i.e. has a cell in the row) has
 * either:
 *   - a non-null score in the viewer-stage column, OR
 *   - is marked N/A on that cell (is_na === true).
 *
 * Employees without a cell for this KPI are NOT assignees and are ignored —
 * they neither hide nor reveal the row. If at least one assignee is still
 * pending, the row stays visible so no work is missed. Rows with zero
 * assignees stay visible (data anomaly, not a processed row).
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
  let assignees = 0;
  for (const empId of employeeIds) {
    const cell = cellMap.get(`${kpiKey}::${empId}`);
    if (!cell) continue;                           // not an assignee → ignore
    assignees++;
    if (cell.is_na === true) continue;             // N/A counts as processed
    const score = cell[stageKey] as number | null | undefined;
    if (score === null || score === undefined) return false; // pending assignee
  }
  return assignees > 0;
}
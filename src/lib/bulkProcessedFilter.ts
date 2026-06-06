import type { BulkReviewRow } from '@/hooks/useBulkReview';

/**
 * Bulk Review presentation filter.
 *
 * A KPI row is considered "fully processed at the viewer stage" when every
 * employee actually ASSIGNED this KPI (i.e. has a cell in the row) has
 * either:
 *   - a non-null score in the viewer-stage column, OR
 *   - is marked N/A on that cell (is_na === true), OR
 *   - the cell is terminal (`final_score !== null`), OR
 *   - the cell's `status` is at or past the viewer's stage in the canonical
 *     8-stage workflow chain (covers KPIs whose workflow does not include
 *     the viewer's stage, e.g. an HR-PMS-only KPI viewed by an Auditor —
 *     Jitendra RCA, Jun 2026).
 *
 * Employees without a cell for this KPI are NOT assignees and are ignored —
 * they neither hide nor reveal the row. If at least one assignee is still
 * pending, the row stays visible so no work is missed. Rows with zero
 * assignees stay visible (data anomaly, not a processed row).
 *
 * Pure / UI-only — does not affect selection, RPC payloads, audit, or RLS.
 */

// Canonical 8-stage chain. `status` follows the convention "last COMPLETED
// stage" (see mem://architecture/pms/workflow-status-convention), so a cell
// is processed at the viewer's stage when status index >= viewer stage index.
const CANONICAL_STAGE_ORDER = [
  'kra_set',
  'self_review',
  'manager_check',
  'skip_level_check',
  'hr_pms_review',
  'audit',
  'management_review',
  'approved',
] as const;

const VIEWER_STAGE_TO_STATUS: Record<string, string> = {
  manager: 'manager_check',
  skip_level: 'skip_level_check',
  hr_pms: 'hr_pms_review',
  auditor: 'audit',
  management: 'management_review',
};

const SCORE_KEY_TO_VIEWER_STAGE: Partial<Record<keyof BulkReviewRow, string>> = {
  manager_score: 'manager',
  skip_level_score: 'skip_level',
  hr_pms_score: 'hr_pms',
  auditor_score: 'auditor',
  management_score: 'management',
};

function statusAtOrPastViewer(status: string | null | undefined, stageKey: keyof BulkReviewRow): boolean {
  if (!status) return false;
  const viewerStage = SCORE_KEY_TO_VIEWER_STAGE[stageKey];
  if (!viewerStage) return false;
  const viewerStatus = VIEWER_STAGE_TO_STATUS[viewerStage];
  if (!viewerStatus) return false;
  const statusIdx = CANONICAL_STAGE_ORDER.indexOf(status as (typeof CANONICAL_STAGE_ORDER)[number]);
  const viewerIdx = CANONICAL_STAGE_ORDER.indexOf(viewerStatus as (typeof CANONICAL_STAGE_ORDER)[number]);
  if (statusIdx < 0 || viewerIdx < 0) return false;
  return statusIdx >= viewerIdx;
}

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
    if (cell.final_score !== null && cell.final_score !== undefined) continue; // terminal
    if (statusAtOrPastViewer(cell.status, stageKey)) continue; // stage completed or bypassed
    const score = cell[stageKey] as number | null | undefined;
    if (score === null || score === undefined) return false; // pending assignee
  }
  return assignees > 0;
}
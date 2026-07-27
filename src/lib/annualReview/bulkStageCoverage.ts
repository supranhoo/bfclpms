/**
 * SSOT for "which annual-review instances may a bulk data upload write to?"
 *
 * ADR-186 / POLICY §AR-SYSTEM-SLOT-COVERAGE.
 *
 * RCA (2026-07-27, employees 100508 + 101676): the uploader recognised only
 * two worlds — `STAGE_SAFE` (early stages, direct write) and `completed`
 * (ADR-171 monotonic admin upgrade). Every MID-WORKFLOW status
 * (`pending_dept`, `pending_bu`, `pending_skip`, `pending_hr`,
 * `pending_management`) fell into a silent coverage gap: the row was skipped
 * with the generic reason "Locked stage: …" and the cohort was invisible in
 * the aggregate "N skip" badge. Those two instances were mid-workflow during
 * the 25-Jul production upload, so their `Annual Production Target Vs Actual`
 * slot stayed empty — and because the score denominator is built from the
 * TEMPLATE weights, an empty weighted slot scores 0/weight, not "excluded".
 *
 * Rules encoded here:
 *  - mid-workflow rows are still skipped BY DEFAULT, but with a
 *    status-specific reason so a whole cohort can never be silently missed;
 *  - an admin may opt in to `allowMidWorkflowUpgrades`, which routes the row
 *    through the same monotonic `admin_apply_system_scores_upgrade` RPC used
 *    for completed rows (upgrades only, audit-logged, never a raw table write).
 */

export type StageCoverageMode = 'safe' | 'admin_upgrade' | 'skip';

export interface StageCoverageDecision {
  mode: StageCoverageMode;
  /** Human reason — only set when `mode === 'skip'`. */
  reason?: string;
}

export interface StageCoverageOptions {
  /** ADR-171 — apply monotonic upgrades to `completed` rows. */
  allowCompletedUpgrades?: boolean;
  /** ADR-186 — apply monotonic upgrades to mid-workflow rows. */
  allowMidWorkflowUpgrades?: boolean;
}

/** Statuses the uploader may write to directly (no reviewer has locked yet). */
export const STAGE_SAFE_STATUSES: readonly string[] = Object.freeze([
  'not_started',
  'pending_self',
  'pending_manager',
]);

/**
 * Statuses that sit between the safe early stages and `completed`. These are
 * live reviews with at least one locked upstream response.
 */
export const MID_WORKFLOW_STATUSES: readonly string[] = Object.freeze([
  'pending_skip',
  'pending_dept',
  'pending_bu',
  'pending_hr',
  'pending_management',
]);

export function isStageSafe(status: string): boolean {
  return STAGE_SAFE_STATUSES.includes(status);
}

export function isMidWorkflow(status: string): boolean {
  return MID_WORKFLOW_STATUSES.includes(status);
}

/** Classify one instance status against the admin's opt-in flags. */
export function classifyStageCoverage(
  status: string,
  opts: StageCoverageOptions = {},
): StageCoverageDecision {
  if (isStageSafe(status)) return { mode: 'safe' };

  if (status === 'completed') {
    return opts.allowCompletedUpgrades
      ? { mode: 'admin_upgrade' }
      : { mode: 'skip', reason: 'Completed review — enable "Apply to Completed reviews (upgrades only)" to include it' };
  }

  if (isMidWorkflow(status)) {
    return opts.allowMidWorkflowUpgrades
      ? { mode: 'admin_upgrade' }
      : {
          mode: 'skip',
          reason: `Mid-workflow stage: ${status} — not covered by safe or completed-upgrade mode; enable "Apply to mid-workflow reviews (upgrades only)" to include it`,
        };
  }

  // excluded / acknowledged / anything unknown — never written to.
  return { mode: 'skip', reason: `Locked stage: ${status}` };
}

/**
 * Group skip reasons for the dialog badge so an entire cohort can never hide
 * behind a single number. Returns `[{ status, count }]`, biggest first.
 */
export function summariseSkipsByStatus(
  rows: Array<{ verdict: string; stageStatus?: string }>,
): Array<{ status: string; count: number }> {
  const byStatus = new Map<string, number>();
  for (const r of rows) {
    if (r.verdict !== 'skip') continue;
    const key = r.stageStatus || 'unknown';
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }
  return [...byStatus.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

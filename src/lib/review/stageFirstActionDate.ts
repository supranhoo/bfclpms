/**
 * ADR-209 / POLICY §AR-STAGE-FIRST-ACTION-DATE
 *
 * SSOT for resolving the FIRST recorded action date of each Review Journey
 * stage from the immutable `kpi_audit_logs` trail.
 *
 * Why not `review_submissions.submitted_at`? It is overwritten on every
 * resubmission (send-back → resubmit), so it cannot answer "when was this
 * first submitted?". The audit log is append-only and therefore the only
 * lawful source.
 */

export type FirstActionStage =
  | 'self'
  | 'manager'
  | 'functional_manager'
  | 'skip_level'
  | 'hr_pms'
  | 'auditor'
  | 'management';

export interface FirstActionLog {
  action: string | null;
  created_at: string | null;
}

/**
 * Qualifying audit actions per stage. Deliberately EXCLUDES generic rows
 * (`STATUS_TRANSITION`, `SUBMISSION_SCORE_CHANGED`, `RECONCILE_STATUS`,
 * send-backs) — those do not represent a stage owner's own submission.
 */
export const STAGE_FIRST_ACTION_ACTIONS: Record<FirstActionStage, readonly string[]> = {
  self: [
    'SELF_REVIEW_SUBMITTED',
    'BACKFILL_SELF_REVIEW_SUBMITTED',
    'ADMIN_DATA_ENTRY_SELF',
  ],
  manager: [
    'MANAGER_FORWARDED',
    'MANAGER_REVIEWED',
    'MANAGER_NA_CONFIRMED',
    'MANAGER_MARKED_NA',
    'MANAGER_PENALTY_SCORED',
    'BULK_STAGE_SIGNOFF_MANAGER',
    'BACKFILL_MANAGER_REVIEWED',
    'ADMIN_DATA_ENTRY_MANAGER',
  ],
  functional_manager: [
    'FUNCTIONAL_MANAGER_FORWARDED',
    'FUNCTIONAL_MANAGER_REVIEWED',
    'ADMIN_DATA_ENTRY_FUNCTIONAL_MANAGER',
  ],
  skip_level: [
    'SKIP_LEVEL_FORWARDED',
    'SKIP_LEVEL_NA_CONFIRMED',
    'SKIP_LEVEL_MARKED_NA',
    'BULK_STAGE_SIGNOFF_SKIP_LEVEL',
    'BULK_NA_MARK_SKIP_LEVEL',
    'BACKFILL_SKIP_LEVEL_REVIEWED',
    'ADMIN_DATA_ENTRY_SKIP_LEVEL',
  ],
  hr_pms: [
    'HR_PMS_FORWARDED',
    'HR_PMS_NA_CONFIRMED',
    'BULK_STAGE_SIGNOFF_HR_PMS',
    'BACKFILL_HR_PMS_REVIEWED',
    'ADMIN_DATA_ENTRY_HR_PMS',
  ],
  auditor: [
    'AUDITOR_REVIEWED',
    'AUDITOR_FORWARDED',
    'BULK_STAGE_SIGNOFF_AUDITOR',
    'BACKFILL_AUDITOR_REVIEWED',
    'ADMIN_DATA_ENTRY_AUDITOR',
  ],
  management: [
    'MANAGEMENT_APPROVED',
    'BACKFILL_MANAGEMENT_REVIEWED',
    'ADMIN_DATA_ENTRY_MANAGEMENT',
    'ADMIN_BULK_OVERRIDE_FORCE_APPROVE',
  ],
};

const ACTION_TO_STAGE: Record<string, FirstActionStage> = (() => {
  const map: Record<string, FirstActionStage> = {};
  (Object.keys(STAGE_FIRST_ACTION_ACTIONS) as FirstActionStage[]).forEach(stage => {
    STAGE_FIRST_ACTION_ACTIONS[stage].forEach(action => {
      map[action] = stage;
    });
  });
  return map;
})();

export type StageFirstActionDates = Record<FirstActionStage, string | null>;

function emptyResult(): StageFirstActionDates {
  return {
    self: null,
    manager: null,
    functional_manager: null,
    skip_level: null,
    hr_pms: null,
    auditor: null,
    management: null,
  };
}

/**
 * Returns the EARLIEST qualifying `created_at` per stage. Later resubmissions
 * never overwrite an earlier one.
 */
export function resolveStageFirstActionDates(
  logs: readonly FirstActionLog[] | null | undefined,
): StageFirstActionDates {
  const result = emptyResult();
  if (!logs || logs.length === 0) return result;

  for (const log of logs) {
    if (!log?.action || !log.created_at) continue;
    const stage = ACTION_TO_STAGE[log.action];
    if (!stage) continue;
    const current = result[stage];
    if (current === null || log.created_at < current) {
      result[stage] = log.created_at;
    }
  }

  return result;
}
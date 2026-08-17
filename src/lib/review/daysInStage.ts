/**
 * ADR-292 / POLICY §RPT-DAYS-IN-STAGE-AUDIT-SSOT
 *
 * SSOT for "Days in Current Stage" in reporting surfaces.
 *
 * Why not `kpis.updated_at`? That column moves on ANY write to the row —
 * score edits, org-KPI propagation, bulk maintenance, migrations. A single
 * system-wide write collapses every KPI's apparent age to ~0 days, which is
 * exactly what made the KPI Status Tracker "Days" column wrong.
 *
 * The lawful source is the append-only `kpi_audit_logs` trail: the most recent
 * STAGE-MOVING event is the moment the KPI entered the stage it sits in today.
 */

export interface StageAuditLog {
  kpi_id: string;
  action: string | null;
  created_at: string | null;
}

/**
 * Actions that move a KPI between workflow stages (forward, send-back,
 * step-back, rollback). A send-back legitimately restarts the clock for the
 * stage that receives the record.
 *
 * `STATUS_TRANSITION` is the generic transition row written by the workflow
 * engine and is included deliberately — for the ageing clock we care about
 * *when the stage changed*, not *who acted*.
 */
export const STAGE_MOVING_ACTION_PREFIXES: readonly string[] = [
  'STATUS_TRANSITION',
  'SELF_REVIEW_',
  'BACKFILL_SELF_REVIEW_',
  'MANAGER_',
  'BACKFILL_MANAGER_',
  'FUNCTIONAL_MANAGER_',
  'SKIP_LEVEL_',
  'BACKFILL_SKIP_LEVEL_',
  'HR_PMS_',
  'BACKFILL_HR_PMS_',
  'BULK_STAGE_SIGNOFF_',
  'BULK_NA_MARK_',
  'AUDITOR_',
  'BACKFILL_AUDITOR_',
  'MANAGEMENT_',
  'BACKFILL_MANAGEMENT_',
  'ADMIN_DATA_ENTRY_',
  'ADMIN_STATUS_STEP_BACK',
  'ADMIN_BULK_STEP_BACK',
  'ADMIN_BULK_OVERRIDE_FORCE_APPROVE',
  'ADMIN_FULL_RESET',
  'WORKFLOW_CHANGE_STEP_BACK',
  'WORKFLOW_RECONCILED',
  'RECONCILE_STATUS',
  'ROLLBACK_APPROVED',
  'KPI_BIMONTHLY_REANCHOR',
];

/**
 * Noise that must NEVER reset the clock: score/value edits, org-KPI
 * propagation, query & observation chatter, weightage housekeeping.
 */
export function isStageMovingAction(action: string | null | undefined): boolean {
  if (!action) return false;
  return STAGE_MOVING_ACTION_PREFIXES.some(p =>
    p.endsWith('_') ? action.startsWith(p) : action === p,
  );
}

/** Statuses where the record is finished and must stop ageing. */
export const TERMINAL_STATUSES: readonly string[] = ['approved'];

export function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

/**
 * Group audit rows into a per-KPI stage-entry timestamp (ms epoch).
 * Only stage-moving actions are considered; the LATEST one wins.
 */
export function buildStageEntryMap(logs: StageAuditLog[]): Map<string, number> {
  const stageEntry = new Map<string, number>();
  const anyEvent = new Map<string, number>();

  for (const log of logs) {
    if (!log?.kpi_id || !log.created_at) continue;
    const ts = new Date(log.created_at).getTime();
    if (!Number.isFinite(ts)) continue;

    const prevAny = anyEvent.get(log.kpi_id);
    if (prevAny === undefined || ts < prevAny) anyEvent.set(log.kpi_id, ts);

    if (!isStageMovingAction(log.action)) continue;
    const prev = stageEntry.get(log.kpi_id);
    if (prev === undefined || ts > prev) stageEntry.set(log.kpi_id, ts);
  }

  // Fallback #2: the KPI's FIRST audit event (it has never moved stage).
  for (const [kpiId, ts] of anyEvent) {
    if (!stageEntry.has(kpiId)) stageEntry.set(kpiId, ts);
  }

  return stageEntry;
}

const MS_PER_DAY = 86_400_000;

/**
 * Resolve the day count for one KPI.
 *
 * Returns `null` for terminal records (nothing is pending, so nothing ages).
 * Fallback chain: stage-moving event → first audit event → KPI creation date.
 * Never silently returns 0 for an old record.
 */
export function resolveDaysInStage(args: {
  kpiId: string;
  status: string | null | undefined;
  createdAt?: string | null;
  stageEntryMap: Map<string, number>;
  now?: Date;
}): number | null {
  if (isTerminalStatus(args.status)) return null;

  const now = (args.now ?? new Date()).getTime();
  let anchor = args.stageEntryMap.get(args.kpiId);

  if (anchor === undefined && args.createdAt) {
    const created = new Date(args.createdAt).getTime();
    if (Number.isFinite(created)) anchor = created;
  }
  if (anchor === undefined) return null;

  return Math.max(0, Math.floor((now - anchor) / MS_PER_DAY));
}

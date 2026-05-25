/**
 * Timeline grouping helper.
 *
 * The Review Timeline reads from `kpi_audit_logs`, where a single human action
 * (e.g. one Bulk HR PMS sign-off) commonly produces 4–5 rows in the same
 * transaction because DB triggers (`safety_net_trigger`, `log_kpi_status_transition`)
 * and the reconciler (`reconcile_workflow_statuses`) each write their own row.
 *
 * `groupTimelineEvents` collapses those side-effect rows under the originating
 * human action so the UI shows one card per real event, with the cascade
 * available behind an expander. Pure / O(n) transform; no DB changes.
 *
 * Bucketing key: `(performed_by, created_at truncated to the second)`. Rows
 * in the same bucket are considered one transaction.
 *
 * Children candidates (side-effects):
 *   • `SUBMISSION_SCORE_CHANGED` when `metadata.source === 'safety_net_trigger'`
 *   • `STATUS_TRANSITION`  (trigger echo of any status column write)
 *   • `RECONCILE_STATUS`   (reconciler tool — informative but a side-effect)
 *
 * Parent priority (first match wins inside the bucket):
 *   1. An explicit human action (ADMIN_*, BULK_*, MANAGER_*, AUDITOR_*,
 *      MANAGEMENT_*, HR_PMS_*, SELF_REVIEW_*, STATUS_CHANGED, etc.)
 *   2. `RECONCILE_STATUS` (so an orphan reconcile is still visible)
 *   3. Otherwise the first row in the bucket (safe fallback — never hides data)
 */

export interface TimelineLog {
  id: string;
  action: string;
  performed_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  // Other fields are passed through untouched.
  [k: string]: unknown;
}

export interface GroupedTimelineEvent<T extends TimelineLog = TimelineLog> {
  parent: T;
  children: T[];
}

const SIDE_EFFECT_ACTIONS = new Set([
  'STATUS_TRANSITION',
  'RECONCILE_STATUS',
]);

function isSideEffect(log: TimelineLog): boolean {
  if (log.action === 'SUBMISSION_SCORE_CHANGED') {
    const src = (log.metadata as { source?: string } | null)?.source;
    return src === 'safety_net_trigger';
  }
  return SIDE_EFFECT_ACTIONS.has(log.action);
}

/**
 * Explicit human-action prefixes. Any audit row whose action starts with one
 * of these (or matches one of the explicit names below) is treated as a
 * candidate parent for its transaction bucket.
 */
const HUMAN_PREFIXES = [
  'ADMIN_',
  'BULK_',
  'MANAGER_',
  'AUDITOR_',
  'MANAGEMENT_',
  'HR_PMS_',
  'SELF_REVIEW_',
  'ORG_KPI_',
  'QUERY_',
  'KPI_',
];

const HUMAN_EXPLICIT = new Set([
  'STATUS_CHANGED',
  'DATA_REPAIR',
  'SCORE_PERCOLATED',
  'PERCOLATION_DEFERRED',
]);

function isHumanAction(log: TimelineLog): boolean {
  if (isSideEffect(log)) return false;
  if (HUMAN_EXPLICIT.has(log.action)) return true;
  return HUMAN_PREFIXES.some((p) => log.action.startsWith(p));
}

function bucketKey(log: TimelineLog): string {
  // Truncate to seconds — every cascading row in a single TX shares
  // the same statement_timestamp().
  const second = log.created_at.slice(0, 19);
  return `${log.performed_by ?? 'system'}|${second}`;
}

export function groupTimelineEvents<T extends TimelineLog>(
  logs: T[],
): GroupedTimelineEvent<T>[] {
  // Preserve the caller's order (timeline is sorted desc by created_at).
  const buckets = new Map<string, T[]>();
  const order: string[] = [];

  for (const log of logs) {
    const key = bucketKey(log);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(log);
  }

  const out: GroupedTimelineEvent<T>[] = [];

  for (const key of order) {
    const rows = buckets.get(key)!;
    if (rows.length === 1) {
      out.push({ parent: rows[0], children: [] });
      continue;
    }

    // Parent priority: human action → RECONCILE_STATUS → first row.
    let parentIdx = rows.findIndex(isHumanAction);
    if (parentIdx === -1) {
      parentIdx = rows.findIndex((r) => r.action === 'RECONCILE_STATUS');
    }
    if (parentIdx === -1) parentIdx = 0;

    const parent = rows[parentIdx];
    const children = rows.filter((_, i) => i !== parentIdx);
    out.push({ parent, children });
  }

  return out;
}

/**
 * ADR-348 / POLICY §129 — Team Reviews default queue visibility.
 *
 * The Team Reviews grid defaults to "Pending action only": an employee card is
 * visible only when they have at least one KPI sitting at a stage the signed-in
 * reviewer personally acts on. That pending count is `badge1` from
 * `getEmployeeKpiStats` (src/components/review/EmployeeSelectorGrid.tsx), which
 * is already relationship-aware:
 *   - direct reports    → KPIs at `self_review` (awaiting manager check)
 *   - indirect (skip)   → KPIs at a status reviewable by the skip-level stage
 *   - functional        → KPIs reviewable by the functional-manager stage
 *
 * SSOT: this predicate is the single definition of "actionable" so the grid
 * filter, the header chip count, and the caught-up empty state can never
 * drift apart.
 */

export interface ActionableStats {
  /** KPIs pending at a stage this reviewer acts on. */
  badge1: number;
}

export type TeamQueueFilter = 'actionable' | 'all';

export const DEFAULT_TEAM_QUEUE_FILTER: TeamQueueFilter = 'actionable';

export function isActionableForReviewer(stats: ActionableStats | null | undefined): boolean {
  return !!stats && stats.badge1 > 0;
}

export function normalizeTeamQueueFilter(raw: string | null | undefined): TeamQueueFilter {
  return raw === 'all' ? 'all' : DEFAULT_TEAM_QUEUE_FILTER;
}

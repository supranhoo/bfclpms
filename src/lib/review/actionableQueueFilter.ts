/**
 * ADR-348 / ADR-359 — POLICY §129 Team Reviews queue visibility.
 *
 * The Team Reviews grid supports three view modes (URL param `queue`):
 *   - `assigned`   (DEFAULT, ADR-359) — every member who has at least one KPI
 *                  assigned for the period, whatever stage it sits at. A team
 *                  member whose KRAs are still at KRA Set stays visible.
 *   - `actionable` (ADR-348) — only members with items pending at a stage this
 *                  reviewer personally acts on (`badge1`, relationship-aware:
 *                  direct → self_review, indirect → skip stage, functional → FM).
 *   - `all`        — the full mapped downline, including members with no KRAs.
 *
 * SSOT: these predicates are the single definition used by the grid filter,
 * the header counts and the empty states, so they can never drift apart.
 */

export interface ActionableStats {
  /** KPIs pending at a stage this reviewer acts on. */
  badge1: number;
  /** Total KPIs assigned to the employee for the period. */
  total?: number;
}

export type TeamQueueFilter = 'assigned' | 'actionable' | 'all';

export const DEFAULT_TEAM_QUEUE_FILTER: TeamQueueFilter = 'assigned';

export function isActionableForReviewer(stats: ActionableStats | null | undefined): boolean {
  return !!stats && stats.badge1 > 0;
}

/** ADR-359 — visible by default: the employee has KRAs/KPIs for the period. */
export function hasAssignedKras(stats: ActionableStats | null | undefined): boolean {
  return !!stats && (stats.total ?? 0) > 0;
}

export function normalizeTeamQueueFilter(raw: string | null | undefined): TeamQueueFilter {
  if (raw === 'all') return 'all';
  if (raw === 'actionable') return 'actionable';
  return DEFAULT_TEAM_QUEUE_FILTER;
}

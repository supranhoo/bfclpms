/**
 * Pure predicate for Team Reviews tile filters.
 *
 * Reason: full-access roles (admin, hr_pms, auditor, management) historically
 * short-circuited the relationship check (isDirect / isIndirect) on the team
 * dashboard, so the Direct-Pending and Skip-Level-Pending tiles surfaced
 * employees whose workflow templates had no `manager_check` or
 * `skip_level_check` stage at all. The tiles must be STAGE-true: an employee
 * only appears under a tile if that exact stage exists in their resolved
 * workflow template AND a KPI is actually sitting at that stage.
 *
 * Callers: src/components/review/EmployeeSelectorGrid.tsx (team viewLevel).
 * Non-team viewLevels (audit, hr_pms, management, skip_level) keep their
 * own stage-aware checks and do not use this predicate.
 */

import { resolveReviewableStatuses } from './workflowEngine';

export type TeamTile =
  | 'pending_kra_set'
  | 'pending_direct'
  | 'pending_skip'
  | 'pending_functional'
  | 'reviewed';

export interface TileContext {
  kpiStatus: string | null | undefined;
  /** Resolved workflow stages for the employee (already filtered to template). */
  stages: string[];
  /** Manager–subordinate relationship from teamMembers list. */
  isDirect: boolean;
  /** Skip-level relationship from skipLevelMembers list. */
  isIndirect: boolean;
  /** ADR-206 — functional-manager relationship (profiles.functional_manager_id). */
  isFunctional?: boolean;
  /** admin / hr_pms / auditor / management role. */
  isFullAccess: boolean;
}

export function matchesTeamTile(tile: TeamTile, ctx: TileContext): boolean {
  const status = ctx.kpiStatus || '';
  const hasManagerStage = ctx.stages.includes('manager_check');
  const hasSkipStage = ctx.stages.includes('skip_level_check');
  const hasFunctionalStage = ctx.stages.includes('functional_manager_check');

  switch (tile) {
    case 'pending_kra_set':
      // KRA-set is the universal first stage; allow direct managers always,
      // and full-access roles when the employee has a self_review stage.
      if (status !== 'kra_set') return false;
      if (ctx.isDirect) return true;
      if (ctx.isFullAccess && ctx.stages.includes('self_review')) return true;
      return false;

    case 'pending_direct':
      if (status !== 'self_review') return false;
      if (!hasManagerStage) return false; // stage-true: no L1 stage ⇒ never "direct pending"
      return ctx.isDirect || ctx.isFullAccess;

    case 'pending_skip': {
      if (!hasSkipStage) return false; // stage-true: no skip stage ⇒ never "skip pending"
      const skipReviewable = resolveReviewableStatuses('skip_level', ctx.stages);
      if (!skipReviewable.includes(status)) return false;
      return ctx.isIndirect || ctx.isFullAccess;
    }

    case 'pending_functional': {
      // ADR-206 — stage-true: no FM stage in the resolved workflow ⇒ never
      // "functional pending". The FM acts on the stage PRECEDING
      // `functional_manager_check`, which resolveReviewableStatuses encodes.
      if (!hasFunctionalStage) return false;
      const fmReviewable = resolveReviewableStatuses('functional_manager', ctx.stages);
      if (!fmReviewable.includes(status)) return false;
      return !!ctx.isFunctional || ctx.isFullAccess;
    }

    case 'reviewed':
      // Direct manager: anything past self_review on direct reports.
      if (ctx.isDirect && !['kra_set', 'self_review'].includes(status)) return true;
      // Indirect / skip: KPI has reached or passed the skip stage.
      if (ctx.isIndirect && hasSkipStage) {
        const slIdx = ctx.stages.indexOf('skip_level_check');
        return slIdx >= 0 && ctx.stages.slice(slIdx).includes(status);
      }
      // ADR-206 — functional: KPI has reached or passed the FM stage.
      if (ctx.isFunctional && hasFunctionalStage) {
        const fmIdx = ctx.stages.indexOf('functional_manager_check');
        return fmIdx >= 0 && ctx.stages.slice(fmIdx).includes(status);
      }
      // Full-access (no relationship): count anything past KRA Set/self_review.
      if (ctx.isFullAccess && !['kra_set', 'self_review'].includes(status)) return true;
      return false;

    default:
      return false;
  }
}

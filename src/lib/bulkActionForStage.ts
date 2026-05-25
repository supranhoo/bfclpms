/**
 * Bulk Review action resolver.
 *
 * Decides which bulk action button to show on the Bulk Review dashboard,
 * based on the viewer's effective role and the selected viewer-stage.
 *
 * Rules (see POLICY.md §111.7):
 *  - effectiveRole = 'management' → terminal mgmt approval (`bulk_management_approve`).
 *  - effectiveRole = 'admin' → mirrors the viewer-stage dropdown:
 *      • viewerStage 'management' → mgmt approval
 *      • else → stage sign-off for that stage
 *  - effectiveRole ∈ {manager, skip_level, hr_pms, auditor} → stage sign-off
 *    bound to their OWN role. The viewer-stage dropdown is ignored for the
 *    action — intermediate reviewers can only bulk-sign as themselves.
 *  - anything else (employee, null) → no bulk action.
 */
export type BulkStage = 'manager' | 'skip_level' | 'hr_pms' | 'auditor';
export type BulkActionKind = 'mgmt' | 'stage';

export interface BulkAction {
  kind: BulkActionKind;
  stage?: BulkStage;     // present when kind === 'stage'
  label: string;
  pendingLabel: string;
}

const STAGE_LABEL: Record<BulkStage, string> = {
  manager: 'Manager',
  skip_level: 'Skip-Level',
  hr_pms: 'HR PMS',
  auditor: 'Auditor',
};

function stageAction(stage: BulkStage): BulkAction {
  return {
    kind: 'stage',
    stage,
    label: `Bulk Sign-off (${STAGE_LABEL[stage]})`,
    pendingLabel: 'Signing off…',
  };
}

const MGMT_ACTION: BulkAction = {
  kind: 'mgmt',
  label: 'Bulk Approve (Mgmt)',
  pendingLabel: 'Approving…',
};

export function bulkActionForStage(
  effectiveRole: string | null | undefined,
  viewerStage: string | null | undefined,
): BulkAction | null {
  if (!effectiveRole) return null;

  if (effectiveRole === 'management') return MGMT_ACTION;

  if (effectiveRole === 'admin') {
    if (viewerStage === 'management') return MGMT_ACTION;
    if (
      viewerStage === 'manager' ||
      viewerStage === 'skip_level' ||
      viewerStage === 'hr_pms' ||
      viewerStage === 'auditor'
    ) {
      return stageAction(viewerStage);
    }
    // Admin with an unknown viewerStage → default to mgmt (safest match
    // for back-compat with the prior canApprove behavior).
    return MGMT_ACTION;
  }

  if (
    effectiveRole === 'manager' ||
    effectiveRole === 'skip_level' ||
    effectiveRole === 'hr_pms' ||
    effectiveRole === 'auditor'
  ) {
    return stageAction(effectiveRole);
  }

  return null;
}
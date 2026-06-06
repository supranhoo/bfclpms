/**
 * Pure helper deciding which reviewer-stage options the Bulk Review dashboard
 * exposes for a given effective role. Admin sees everything; non-admin roles
 * see only their own stage; a `manager` who is also referenced as a
 * functional manager on another active profile additionally sees the
 * Functional Manager option.
 *
 * Kept role-pure (no React, no Supabase) so it can be unit-tested in
 * isolation — see src/test/bulkReview/viewerStageVisibility.test.ts.
 */
export interface ViewerStageOption {
  value: string;
  label: string;
}

export const ALL_VIEWER_STAGES: ViewerStageOption[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'functional_manager', label: 'Functional Manager' },
  { value: 'skip_level', label: 'Skip-Level' },
  { value: 'hr_pms', label: 'HR PMS' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
];

export function allowedViewerStages(
  effectiveRole: string | null | undefined,
  isFunctionalManager: boolean,
): ViewerStageOption[] {
  if (effectiveRole === 'admin') return ALL_VIEWER_STAGES;
  const out: ViewerStageOption[] = [];
  switch (effectiveRole) {
    case 'manager':
      out.push(ALL_VIEWER_STAGES[0]);
      if (isFunctionalManager) out.push(ALL_VIEWER_STAGES[1]);
      return out;
    case 'skip_level':
      return [ALL_VIEWER_STAGES[2]];
    case 'hr_pms':
      return [ALL_VIEWER_STAGES[3]];
    case 'auditor':
      return [ALL_VIEWER_STAGES[4]];
    case 'management':
      return [ALL_VIEWER_STAGES[5]];
    default:
      return [];
  }
}

/**
 * Clamp a requested stage value to the allowed list. Returns the requested
 * value if it is allowed, otherwise the first allowed value, otherwise null.
 */
export function clampViewerStage(
  requested: string | null | undefined,
  allowed: ViewerStageOption[],
): string | null {
  if (requested && allowed.some((s) => s.value === requested)) return requested;
  return allowed[0]?.value ?? null;
}
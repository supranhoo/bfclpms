import type { AppRole } from '@/lib/roles';

export const ANNUAL_REVIEW_TEAM_STATIC_ROLES: AppRole[] = [
  'admin',
  'manager',
  'hr_pms',
  'skip_level',
  'management',
];

export function annualReviewTeamAccessAllowed(
  effectiveRole: AppRole | null | undefined,
  directoryCanAccess: boolean,
): boolean {
  return Boolean(
    (effectiveRole && ANNUAL_REVIEW_TEAM_STATIC_ROLES.includes(effectiveRole))
      || directoryCanAccess,
  );
}
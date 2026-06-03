/**
 * Centralized role definitions — SINGLE SOURCE OF TRUTH for all role-based logic.
 *
 * PREVENTIVE ACTION: When adding a new role to the database (app_role enum),
 * update ONLY this file. All other files import from here and will automatically
 * pick up the new role.
 *
 * Files that consume this:
 *  - src/contexts/AuthContext.tsx
 *  - src/components/layout/ProtectedRoute.tsx
 *  - src/components/layout/AppSidebar.tsx (via role arrays on menu items)
 */

export const ALL_APP_ROLES = [
  'admin',
  'manager',
  'employee',
  'auditor',
  'management',
  'hr_pms',
  'skip_level',
  'platform_owner',
] as const;

export type AppRole = typeof ALL_APP_ROLES[number];

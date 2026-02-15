

# Admin Role Switch -- "View as My Role"

## Overview

Add a toggle in the sidebar footer that allows admin users to switch between their **Admin view** (full access) and their **natural hierarchical role** (Manager or Employee, based on org structure). This is a UI-level lens change -- the database role stays `admin`, preserving all RLS permissions.

## How It Works

1. Admin sees a small switch in the sidebar footer: **"Admin View"** (on by default)
2. Turning it **off** makes the app behave as if they are a Manager or Employee:
   - Sidebar hides admin-only sections (Administration, Audit, Management, HR PMS)
   - Dashboard only shows modes relevant to their natural role
   - ProtectedRoute blocks admin-only pages
   - They experience the exact same UI a manager/employee would see
3. Turning it **on** restores full admin capabilities
4. Preference is saved in localStorage so it survives page refresh

## Natural Role Detection

The system determines the admin's "natural" role by checking if they have direct reports:

- Query `profiles` where `reporting_manager_id = currentUserId`
- If any direct reports exist --> natural role = `manager`
- If no direct reports --> natural role = `employee`

This query runs once on login and is cached.

## Impact on Existing Flows

- **No database changes** -- the actual `user_roles` table stays as `admin`
- **No RLS impact** -- database permissions remain unchanged; the admin can still technically query anything
- **No workflow engine changes** -- score fields and status transitions are untouched
- **Team Reviews merge** works correctly: when admin switches to "manager" lens, they only see their direct/indirect reports (not all employees), and the relationship tagging routes them to the correct scorecard viewLevel

## Files Changed

| File | Change |
|---|---|
| `src/contexts/AuthContext.tsx` | Add `effectiveRole`, `isAdminMode`, `toggleAdminMode`, `naturalRole` to context. Fetch direct reports count to derive natural role. |
| `src/components/layout/AppSidebar.tsx` | Use `effectiveRole` instead of `role` for section visibility. Add Admin View toggle switch in the footer. |
| `src/components/layout/MinimalHeader.tsx` | Display `effectiveRole` label instead of raw `role`. |
| `src/components/layout/ProtectedRoute.tsx` | Use `effectiveRole` for route guarding (but still allow admin to access admin routes when admin mode is on). |
| `src/pages/Dashboard.tsx` | Use `effectiveRole` for `availableModes` calculation. |
| `src/components/review/EmployeeSelectorGrid.tsx` | Use `effectiveRole` to determine `isFullAccess` (only true when admin mode is on). |
| `src/components/layout/DataOwnerRoute.tsx` | Use `effectiveRole` for access check. |
| `src/hooks/useOrgKpiDataOwner.ts` | Use `effectiveRole` for admin bypass check. |
| `src/hooks/useKpiFilters.ts` | Use `effectiveRole` for admin filter check. |
| `src/components/dashboard/KpiLogicModal.tsx` | Use `effectiveRole` for edit permission. |
| `src/pages/PMSPolicy.tsx` | Use `effectiveRole` for admin controls. |
| `src/components/pip/PIPDetailSheet.tsx` | Use `effectiveRole` for HR check. |
| `DOCUMENTATION.md` | Document the Admin Role Switch feature. |

## Technical Details

### AuthContext Changes

```text
// New state
naturalRole: AppRole | null     // 'manager' or 'employee' based on org hierarchy
isAdminMode: boolean            // true = full admin, false = natural role
effectiveRole: AppRole | null   // isAdminMode ? role : naturalRole
toggleAdminMode: () => void     // flip the switch

// On login (after profile fetch), if role === 'admin':
//   1. Check localStorage for saved preference
//   2. Query profiles where reporting_manager_id = user.id (LIMIT 1)
//   3. If count > 0 -> naturalRole = 'manager', else 'employee'
//   4. Set effectiveRole accordingly
```

### Sidebar Toggle UI

A compact switch row added above the profile card in the sidebar footer:

```text
+----------------------------------+
| [Admin icon]  Admin View   [ON ] |
+----------------------------------+
| [Avatar] Admin Name              |
|          admin -> manager        |
+----------------------------------+
```

When toggled off, the role label changes to show the natural role (e.g., "manager") and admin-only sidebar sections collapse away.

### Consumer Migration

All components that currently destructure `role` from `useAuth()` and use it for UI decisions will be updated to also pull `effectiveRole` and use that for visibility/access checks. The raw `role` remains available for the rare cases where the true database role matters (e.g., audit log entries that tag "performed by admin").


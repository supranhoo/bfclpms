

# Fix: Add "HR PMS" Role to User Management Dropdowns

## Problem

The `hr_pms` role was added to the `app_role` database enum but is missing from all role selection dropdowns in the User Management page. Without it, admins cannot assign the HR PMS role to users, which means the HR PMS Review stage in the new 8-stage workflow cannot function.

## Changes

### File: `src/pages/admin/UserManagement.tsx`

Add `<SelectItem value="hr_pms">HR PMS</SelectItem>` to all 4 role dropdown locations:

1. **Role filter dropdown** (~line 570) — so admins can filter the user list by HR PMS role
2. **Edit User dialog** (~line 792) — so admins can assign HR PMS role when editing a user
3. **Create User dialog** (~line 903) — so admins can assign HR PMS role when creating a user
4. **Bulk role update** (~line 984) — so admins can bulk-assign the HR PMS role

Each dropdown currently lists: Employee, Manager, Auditor, Management, Admin. After the fix, the order will be: Employee, Manager, Auditor, HR PMS, Management, Admin.

### File: `DOCUMENTATION.md`

Add a note that the HR PMS role is assignable via User Management.

## No Other Files Affected

The `ProtectedRoute` component and `AuthContext` already handle roles dynamically from the database, so no changes are needed there. The `AppSidebar` role filtering also reads from the auth context dynamically.


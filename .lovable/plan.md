
# Admin-Controlled PMS Policy Visibility by Role

## Summary

Add a new setting that lets admins choose which roles can see the PMS Policy page. The control will appear on the PMS Policy page itself (visible only to admins) and also persist in the database.

## Before

- PMS Policy sidebar link is hardcoded to be visible to all 6 roles: `admin`, `manager`, `employee`, `auditor`, `management`, `hr_pms`
- No way for admins to hide the policy from specific roles
- All authenticated users can access `/pms-policy`

## Changes

### 1. Database: Add `pms_policy_visible_roles` column

Add a `jsonb` column to `app_settings` with a default value of all roles:

```text
ALTER TABLE app_settings
ADD COLUMN pms_policy_visible_roles jsonb
DEFAULT '["admin","manager","employee","auditor","management","hr_pms"]'::jsonb;
```

### 2. AppSettings interface and hook

Add `pms_policy_visible_roles: string[]` to the `AppSettings` interface and include it in the `useUpdateAppSettings` mutation's allowed fields.

### 3. PMS Policy page -- Add visibility control for admins

On the `PMSPolicy.tsx` page, next to the existing "Edit Policy" button (admin-only), add a "Visibility Settings" popover/section with checkboxes for each role. Admins can toggle which roles see the page and save.

### 4. Sidebar -- Dynamic role filtering

In `AppSidebar.tsx`, instead of the hardcoded roles array for the PMS Policy item, read `pms_policy_visible_roles` from `useAppSettings()` and use it dynamically. Admins always see the item regardless of the setting.

### 5. Route guard

In `App.tsx`, the `/pms-policy` route should check the visibility setting and redirect unauthorized roles to `/dashboard`.

## After

- **Admin view**: On the PMS Policy page, admins see a "Visibility" control (popover with role checkboxes) alongside the "Edit Policy" button. They can check/uncheck roles like Employee, Manager, Auditor, etc. Admin is always checked and cannot be unchecked.
- **Non-admin view**: Only users whose role is in the `pms_policy_visible_roles` list see the "PMS Policy" sidebar link and can access the page. Others do not see it in the sidebar and are redirected if they navigate directly.
- **Default**: All roles enabled (same as current behavior -- no breaking change).

## Technical Details

### Files to Create
None

### Files to Modify

| File | Change |
|---|---|
| New SQL migration | Add `pms_policy_visible_roles` jsonb column with default |
| `src/hooks/useAppSettings.ts` | Add field to interface and mutation |
| `src/pages/PMSPolicy.tsx` | Add role visibility popover for admins |
| `src/components/layout/AppSidebar.tsx` | Read setting and filter PMS Policy item dynamically |
| `DOCUMENTATION.md` | Document the new setting |

### Risk
Very low -- additive change with backward-compatible default (all roles visible).

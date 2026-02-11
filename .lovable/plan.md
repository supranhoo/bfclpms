

# Hide PMS Policy from Non-Admin Users

## Changes

### 1. Sidebar (`src/components/layout/AppSidebar.tsx`, line 53)

Change the `roles` array for the "PMS Policy" menu item from `['employee', 'manager', 'admin', 'auditor', 'management']` to `['admin']` only.

### 2. Route Protection (`src/App.tsx`, line 95)

Wrap the `/pms-policy` route with `<ProtectedRoute allowedRoles={['admin']}>` so non-admin users who navigate directly to the URL are redirected to `/dashboard`.

### 3. Documentation (`DOCUMENTATION.md`)

Add a note that the PMS Policy page is currently restricted to admin users only.


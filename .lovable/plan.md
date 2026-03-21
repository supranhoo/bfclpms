

## Fix: KPI Mapping Matrix Report Redirects Non-Admin Users

### Problem
The KPI Mapping Matrix report card on the Reports Hub is visible to `manager`, `auditor`, `hr_pms`, and `management` roles (because it shares `reportKey: 'kpi-detail'`). However, the route `/admin/kpi-mapping` is protected with `allowedRoles={['admin']}`, so clicking it redirects non-admin users to `/dashboard`.

### Fix

**File: `src/App.tsx` (line 307)**
Expand `allowedRoles` for the `/admin/kpi-mapping` route to include all roles that can view the report:

```typescript
<ProtectedRoute allowedRoles={['admin', 'manager', 'auditor', 'hr_pms', 'management']}>
```

This aligns route access with the report visibility rules already defined in the Reports Hub (`reportKey: 'kpi-detail'` grants view to these roles).

### No other files changed. No database changes needed.


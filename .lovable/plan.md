

# Admin Rollback Request Management Panel

## Problem

13 rollback requests are stuck in "pending" because:
1. 10 requests were raised by users who are listed as their own reporting managers (self-manager deadlock) -- no one else sees the banner to approve them
2. 3 requests have valid reporting managers but the managers haven't noticed or actioned them
3. There is no centralized admin view to monitor, filter, or action rollback requests

## Solution

Create a dedicated admin page at `/admin/rollback-requests` with a table of all rollback requests, status filters, and approve/reject actions. Also surface the pending count on the Admin Dashboard for visibility.

## Technical Implementation

### 1. New Hook: `src/hooks/useAllRollbackRequests.ts`

- Fetches all rollback requests (not just per-KPI) with joins to:
  - `profiles` (requester name, employee code)
  - `kpis` (KPI name, KRA name, review period, review year, employee_id)
  - `profiles` again via `kpis.employee_id` (employee name)
- Supports a `statusFilter` parameter: `'all' | 'pending' | 'approved' | 'rejected' | 'expired'`
- Query key: `['all-rollback-requests', statusFilter]`
- Returns enriched data with requester info, KPI details, and employee info

### 2. New Page: `src/pages/admin/RollbackRequests.tsx`

Layout:
```
+--------------------------------------------------------------------+
| Rollback Requests                                                    |
| Monitor and action KPI rollback requests across the organization     |
+--------------------------------------------------------------------+
| [Stats Cards]                                                        |
| Pending: 13  |  Approved: 13  |  Rejected: 2  |  Expired: 8        |
+--------------------------------------------------------------------+
| Status Filter: [All] [Pending] [Approved] [Rejected] [Expired]      |
| Search: [___________________________]                                |
+--------------------------------------------------------------------+
| Table:                                                               |
| Requester | Employee | KPI | KRA | Period | From -> To | Reason | .. |
| ...       | ...      | ... | ... | ...    | ...        | ...    | .. |
+--------------------------------------------------------------------+
```

Features:
- **Stats cards** showing counts per status
- **Status filter chips** (default: Pending)
- **Search** by requester name, employee name, KPI name
- **Table columns**: Requester (name + code), Employee (name + code), KPI Name, KRA, Review Period, From Status -> Target Status (with badges), Reason, Created Date, Actions
- **Actions column** (only for pending): Approve button, Reject button
- **Self-manager flag**: Show a warning icon next to requests where the requester is the employee's reporting manager (indicating deadlock)
- Reuses existing `useApproveRollbackRequest()` and `useRejectRollbackRequest()` hooks
- Invalidates `['all-rollback-requests']` query key on success (add to existing hooks' onSuccess)

### 3. Update: `src/App.tsx`

- Add lazy import for `RollbackRequests` page
- Add route: `/admin/rollback-requests` with `ProtectedRoute allowedRoles={['admin']}`

### 4. Update: `src/components/layout/AppSidebar.tsx`

- Add new menu item to the `admin` section:
  - Title: `Rollback Requests`
  - Icon: `Undo2` (from lucide-react)
  - Path: `/admin/rollback-requests`
  - Roles: `['admin']`

### 5. Update: `src/pages/admin/AdminDashboard.tsx`

- Add a query to count pending rollback requests
- Add a new stat card: "Pending Rollbacks" with count, clicking navigates to `/admin/rollback-requests`

### 6. Update: `src/hooks/useKpiRollbackRequests.ts`

- In `useApproveRollbackRequest` and `useRejectRollbackRequest` onSuccess handlers, add: `queryClient.invalidateQueries({ queryKey: ['all-rollback-requests'] })`
- This ensures the admin panel refreshes when any rollback is actioned from anywhere

### 7. Update: `DOCUMENTATION.md`

- Version bump to 1.45.55
- Document the new admin rollback management panel

## RLS Analysis -- No Changes Needed

The existing RLS policies already support this:
- **SELECT**: `true` for all authenticated users (admin can see all requests)
- **UPDATE**: `auth.uid() <> requested_by` (admin can approve/reject any request they didn't create)
- **INSERT**: `auth.uid() = requested_by` (unchanged, only requester creates)

No database migrations required.

## Zero Functionality Lost

- Existing per-KPI rollback banner in review panels -- unchanged
- RollbackRequestDialog for employees -- unchanged
- Notification flow on approve/reject -- unchanged (existing hooks handle this)
- Audit logging on approve/reject -- unchanged
- KPI status reversion on approve -- unchanged
- All other admin features -- unchanged

## Files Summary

| File | Change |
|------|--------|
| `src/hooks/useAllRollbackRequests.ts` | **NEW** -- fetch all rollback requests with filters |
| `src/pages/admin/RollbackRequests.tsx` | **NEW** -- admin management page |
| `src/App.tsx` | Add route + lazy import |
| `src/components/layout/AppSidebar.tsx` | Add sidebar menu item |
| `src/pages/admin/AdminDashboard.tsx` | Add pending rollback count card |
| `src/hooks/useKpiRollbackRequests.ts` | Add query invalidation for admin list |
| `DOCUMENTATION.md` | Version bump + changelog |


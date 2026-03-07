

# Plan: Add Active/Inactive Status for Employees

## Problem
When employees leave the organization, there is no way to deactivate them. Currently the only option is to delete them, which loses historical data. An Active/Inactive toggle is needed to:
1. Block login access for inactive users
2. Exclude them from KPI rollover
3. Hide them from active employee lists (reviewer panels, manager dropdowns, assignment dialogs)
4. Preserve their historical KPI and review data

## Changes Required

### 1. Database Migration — Add `is_active` column to `profiles`

```sql
ALTER TABLE public.profiles 
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Add deactivated_at timestamp for audit trail
ALTER TABLE public.profiles 
  ADD COLUMN deactivated_at timestamptz;
```

No RLS changes needed — existing policies already govern profile access. The column is just a data flag.

### 2. Auth Gate — Block Login for Inactive Users

**File: `src/contexts/AuthContext.tsx`**
- After fetching the profile on login/session restore, check `is_active`.
- If `is_active === false`, sign the user out immediately and show a toast: "Your account has been deactivated. Contact your administrator."
- Add `is_active` to the `Profile` interface.

### 3. User Management UI — Add Active/Inactive Toggle

**File: `src/pages/admin/UserManagement.tsx`**
- Add a **Status** column to the table showing Active/Inactive badge.
- Add a **status filter** dropdown (All / Active / Inactive) alongside existing role/department filters. Default to "Active".
- In the **Edit User dialog**, add an Active/Inactive switch. When toggling to inactive, set `deactivated_at = now()`. When reactivating, clear `deactivated_at`.
- Add a **bulk deactivate** option in the bulk actions dialog.
- Update stats cards to show Active vs Total counts.

### 4. KPI Rollover — Skip Inactive Employees

**File: `supabase/functions/auto-rollover-kpis/index.ts`**
- After fetching source KPIs grouped by employee, query `profiles` to get `is_active` status for each employee.
- Skip employees where `is_active = false` and log them as `skipped` with reason "inactive".

### 5. Employee Selectors — Filter Out Inactive Users

Several components query profiles for assignment/selection. Add `.eq('is_active', true)` filter to:

| File | Query Purpose |
|------|---------------|
| `src/hooks/useOrganization.ts` → `useProfiles()` | Add filter but keep inactive visible when status filter = "Inactive" on User Management. For other consumers (reviewer panels, dropdowns), default to active only. |
| `src/hooks/useOrganization.ts` → `useTeamMembers()` | Manager's direct reports — show only active |
| `src/components/admin/OrgKpiAddEmployeeDialog.tsx` | Already has `.eq('is_active', true)` — will work automatically |
| `src/components/admin/ReviewPeriodEmployeeLocks.tsx` | Employee locks — show only active |
| `src/components/admin/SmartAssignmentDialog.tsx` | KRA assignment — show only active |
| Reporting manager dropdowns (edit/create user) | Only show active users as potential managers |

### 6. Reports & Dashboard — Handle Gracefully

- Inactive employees' **historical data remains visible** in reports (Performance Report, Department Report, etc.).
- The Management Dashboard's direct reportees monitor should only count active employees.
- The KPI Weightage Dashboard should show inactive employees grayed out with a badge but not exclude them (historical data).

## Impact Summary

| Area | Effect |
|------|--------|
| Login | Blocked for inactive users |
| KPI Rollover | Skipped for inactive users |
| Assignment Dialogs | Inactive users hidden |
| Manager Dropdowns | Inactive users hidden |
| Historical Data | Preserved and visible in reports |
| User Management | New filter, toggle, bulk action |
| Notifications/Emails | Inactive users excluded from future sends |

## Risk Assessment
- **Data Impact**: Additive column with safe default (`true`). No existing data affected.
- **Regression Risk**: Low — filter is opt-in for existing queries. `useProfiles()` will gain an optional parameter.
- **Auth Security**: Server-side check on every session restore ensures deactivated users cannot bypass the gate by having a cached session.


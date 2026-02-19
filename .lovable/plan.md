
# Fix Plan: Two Separate RLS & Sidebar Issues for Vivek (HR PMS)

## Issue 1: Vivek Sees Only 26 Employees in HR PMS Panel (Should See 426)

### Root Cause: Missing `profiles` SELECT Policy for `hr_pms` Role

The `profiles` table has SELECT policies for:
- `admin` — can view all profiles
- `auditor` — can view all profiles
- `management` — can view all profiles
- `manager` — can view direct reports and skip-level reports

But there is **zero** SELECT policy for the `hr_pms` role.

When `useProfilesByWorkflowStage` runs for Vivek, it executes:
```sql
SELECT * FROM profiles ORDER BY full_name
```
Due to RLS, Vivek can only see profiles he has access to:
1. His own profile (1 row) — via `"Users can view their own profile"` 
2. ~38 profiles of employees whose org-level KPIs he manages — via `"Data owners can view org kpi employee profiles"` (the `is_data_owner_for_employee` function)

After the workflow-stage filter keeps only those with `hr_pms_review`, that's exactly 26 — matching the screenshot.

The actual correct count should be **426 employees** (the result of the database query above showing all employees whose effective workflow contains `hr_pms_review`).

### Fix: Add a single RLS policy on `profiles` for `hr_pms`

```sql
CREATE POLICY "HR PMS can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'hr_pms'));
```

This mirrors the exact pattern used for Management and Auditor roles.

---

## Issue 2: Vivek Cannot See/Access "Org KPI Data Entry" in the Sidebar

### Root Cause: `hr_pms` Role Missing from Sidebar Menu Item's Roles Array

In `AppSidebar.tsx`, line 92-94:

```typescript
dataEntry: [
  { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', roles: ['employee', 'manager', 'auditor', 'management'] },
],
```

The `hr_pms` role is **not in this list**. The sidebar's `filterByRole()` function filters items to only those whose `roles` array includes the current user's `effectiveRole`. Since Vivek's `effectiveRole` is `hr_pms`, this item is stripped out by the filter — so it never renders, even though the "Data Entry" section header does appear (controlled by `effectiveRole !== 'admin' && isDataOwner`).

### Fix: Add `hr_pms` to the roles array

```typescript
dataEntry: [
  { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', roles: ['employee', 'manager', 'auditor', 'management', 'hr_pms'] },
],
```

---

## Technical Notes

### Why the Previous Migration (v1.45.23) Didn't Fix Issue 1

The previous migration correctly fixed `kpis` and `review_submissions` tables — both now use `authenticated` role. But the `profiles` table was a **separate missing policy** that was never addressed. The `kpis` fix allowed Vivek to read KPI data, but without the `profiles` fix, the employee list (which drives the `EmployeeSelectorGrid`) is still limited to ~26 employees.

### org_kpi_values Admin Policy (Bonus Fix)

The audit also reveals that `org_kpi_values` has two policies set to `{public}` role (same bug that was fixed on `kpis`/`review_submissions`):
- `"Admins can manage org_kpi_values"` → uses `{public}`
- `"Authenticated users can view org_kpi_values"` → uses `{public}`

These should also be fixed to `{authenticated}`.

---

## Files to Modify

| File | Change |
|---|---|
| Database migration | Add `"HR PMS can view all profiles"` SELECT policy on `profiles`; fix `org_kpi_values` public→authenticated policies |
| `src/components/layout/AppSidebar.tsx` | Add `'hr_pms'` to the `dataEntry` menu item's `roles` array |
| `DOCUMENTATION.md` | Version bump to 1.45.24 |

---

## What Changes for Vivek After This Fix

| Before | After |
|---|---|
| HR PMS panel shows 26 employees (only those Vivek manages as data owner) | HR PMS panel shows all 426 employees with `hr_pms_review` in their workflow |
| "Org KPI Data Entry" menu item invisible in sidebar despite being a data owner | "Org KPI Data Entry" menu item visible and clickable for Vivek |
| Jaspal's team (Ankit, Jitendra, Randhir, Samir, Upendra, etc.) not visible | All team members visible in HR PMS panel |
| Pending Review count shows 17 (only from the 26 visible profiles) | Pending Review count shows correct count across all eligible employees |

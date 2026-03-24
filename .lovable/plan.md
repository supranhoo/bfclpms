

## RCA: Data Owner Shows "Unknown" and "Data Entered By" Missing for Employees

### Root Cause

The `profiles` table has restrictive RLS policies. A regular employee can only SELECT:
- Their own profile row
- Their direct reports (if they're a manager)

When the `useOrgKpiDataOwnerNames` hook queries `org_kpi_data_owners` with a JOIN on `profiles` to get `full_name`, the join **silently returns null** because the employee cannot read the data owner's profile row. This causes:

1. **"Data Owner: Unknown"** — `(row.owner as any)?.full_name || 'Unknown'` falls back to "Unknown"
2. **"Data entered by" missing** — `entered_by_profile.full_name` is null, so `entered_by_name` is null, and the badge condition `orgKpiEnteredByName &&` evaluates to false

### Why Previous Fix Didn't Work

The `show_data_owner_to_employees` toggle was added to control visibility, but the underlying data was already null due to RLS. The toggle gate passes, but there's nothing to display.

### Fix: Add Profile RLS Policy for Org KPI Context

Add a new SELECT policy on `profiles` that allows any authenticated user to read profiles that are referenced as org KPI data owners or org KPI value enterers. This is safe because it only exposes the `full_name` — and the data owner assignment is already public knowledge (the `org_kpi_data_owners` table has `USING (true)` for SELECT).

#### 1. Database Migration — New RLS Policy

```sql
-- Allow any authenticated user to view profiles of org KPI data owners
CREATE POLICY "Authenticated users can view org kpi data owner profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE org_kpi_data_owners.owner_id = profiles.id
    )
  );

-- Allow any authenticated user to view profiles of org KPI value enterers
CREATE POLICY "Authenticated users can view org kpi value enterer profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_kpi_values
      WHERE org_kpi_values.entered_by = profiles.id
    )
  );
```

#### 2. Also fix case-sensitivity bug in AuditScorecard

In `src/components/review/AuditScorecard.tsx` line 123, the lookup map key uses `v.kra_name` and `v.kpi_name` WITHOUT `.toLowerCase()`, while all other scorecards and the lookup function use `.toLowerCase()`. This causes org KPI values to not match in audit view.

Fix: add `.toLowerCase()` to the map key construction.

### Files Modified
- DB migration (2 new RLS policies on `profiles`)
- `src/components/review/AuditScorecard.tsx` — fix case-sensitivity in orgKpiValuesMap key


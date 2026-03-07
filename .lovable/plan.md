

# Plan: Add "Copy KPI to Months" Feature

## Problem
There is no way to take a single KPI and replicate it into specific months where it doesn't yet exist. The admin must either use the full rollover (which copies everything) or manually create the KPI in each month.

## Solution
Add a **"Copy to Months"** action in the Admin KPI Edit Dialog (or as a new button on the KPI row in the All KPIs page) that lets the admin select which months to copy the KPI into.

### UI
- Add a new button/option in `AdminKpiEditDialog.tsx` — e.g. a "Copy to Other Months" section or a separate small dialog triggered from the edit dialog.
- Show a **checkbox grid of all 12 months** (grouped by fiscal year). Months that already have this KPI (same employee + kra_name + kpi_name) are shown as disabled/checked. Missing months are selectable.
- A "Copy" button inserts the KPI into all selected months.

### Logic
1. Query existing siblings: `supabase.from('kpis').select('review_period, review_year').eq('employee_id', ...).eq('kra_name', ...).eq('kpi_name', ...).in('review_year', fiscalYears)`
2. Display month grid with existing months pre-checked and disabled.
3. On submit, insert new KPI records for each selected month (copying all structural fields, setting `status: 'kra_set'`).
4. Upsert the `review_periods` row for each target month if it doesn't exist.
5. Show toast with count of KPIs created.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/AdminKpiEditDialog.tsx` | Add a "Copy to Other Months" expandable section below the Apply Scope radio group. Include month checkbox grid, query for existing siblings, and insert logic. |

### Risk Assessment
- **Data Impact**: Creates new KPI records with `kra_set` status. Uses the `idx_kpis_no_duplicates` constraint as a safety net against duplicates.
- **Regression Risk**: Low — this is additive functionality behind a new UI element. Existing edit/bulk-apply logic is untouched.
- **Security**: Admin-only action, consistent with existing admin KPI management patterns.


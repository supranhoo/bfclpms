

# Root Cause Analysis: Quarterly KPI in January Reaching Audit

## What Happened

The screenshot shows a **Quarterly Q1 KPI** ("New vendor addition") with `review_period = January 2026` that has progressed all the way to the **Audit stage**. This should not be possible because January is a **locked month** within Q1 (Jan-Mar cycle) — only **March** (the terminal month) should allow review submissions.

## Root Cause

**Two compounding failures:**

1. **KPIs were created with the wrong `review_period`**: When KPIs were bulk-imported or created (Feb 11, 2026), the system assigned `review_period = 'January'` (the calendar month at the time) instead of `'March'` (the Q1 cycle's active/terminal month). The import and creation flows do not auto-correct multi-month frequency periods.

2. **The frequency lock trigger didn't exist yet**: The DB trigger `kpi_frequency_lock_check` was only created on **Feb 19, 2026** — 8 days after these KPIs were imported. By then, many had already transitioned past `kra_set → self_review`. Additionally, admins bypass the trigger entirely.

**Data audit confirms the scope:**

| Frequency | Period | Count | Should Be |
|---|---|---|---|
| Quarterly | January | 34 KPIs | March |
| Quarterly | February | 35 KPIs | March |
| Bi-Monthly | January | 28 KPIs | February |

Of the 34 Quarterly KPIs in January: 7 are approved, 2 at management_review, 1 at manager_check, 1 at self_review, and 23 still at kra_set. All have incorrect review periods.

## Proposed Fix (3 Parts)

### 1. Data Correction Migration
Update all existing multi-month frequency KPIs that have a locked-month `review_period` to their cycle's active/terminal month. For standard quarterly (Jan-Mar cycle):
- January → March
- February → March
- Similarly for Bi-Monthly locked months

This also requires updating matching `review_submissions` rows so the KPI-submission period stays in sync.

### 2. Fix KPI Import/Creation Logic
Modify the `import-kpis` edge function and `AdminKpiCreateDialog` to auto-resolve `review_period` to the cycle's active month when the frequency is multi-month. Use the same `getActiveMonthForCycle` utility already available.

### 3. Strengthen Frequency Lock Trigger
Extend the DB trigger to also block `INSERT` of KPIs with a locked-month review_period for non-admin users, not just status transitions.

## Risk Assessment
- **Data Impact**: 97 KPIs across Quarterly and Bi-Monthly will have their `review_period` corrected. Historical audit log entries and review_submissions must be updated in sync.
- **Workflow Impact**: KPIs currently in-progress (approved, management_review) will shift to the correct period — this may change which month they appear under in dashboards.
- **Regression Risk**: Low. The active-month resolution logic already exists and is tested.

## Files to Modify
1. **New migration**: Correct existing `review_period` values for multi-month KPIs
2. `supabase/functions/import-kpis/index.ts` — Auto-resolve period on import
3. `src/components/admin/AdminKpiCreateDialog.tsx` — Auto-resolve period on manual creation
4. DB trigger enhancement — Block inserts with locked periods


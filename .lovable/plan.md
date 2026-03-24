

## RCA & Fix: KPIs Stuck at Removed Workflow Stage (e.g., HR PMS Review)

### Root Cause

When an admin changes an employee's workflow to remove a stage (e.g., removes `hr_pms_review` for January), any KPIs already at that status become orphaned — no reviewer can see or act on them.

The existing `reconcile_workflow_statuses` RPC has a logic bug: it only reconciles KPIs whose status is **past the terminal stage**. It skips KPIs at a removed **middle stage**. Specifically:

```text
Canonical order: kra_set(1), self_review(2), manager_check(3), skip_level_check(4),
                 hr_pms_review(5), audit(6), management_review(7)

Employee workflow (no HR PMS): [kra_set, self_review, manager_check, audit, approved]
Terminal stage: audit (index 6)

KPI at hr_pms_review (index 5): 5 < 6 → SKIP (bug!)
```

The function thinks the KPI is "behind" the terminal stage and still progressing. But `hr_pms_review` doesn't exist in this workflow, so it's stuck forever.

### Fix: Two-Part Solution

#### Part 1: Fix `reconcile_workflow_statuses` RPC

The current logic checks if the KPI canonical index is past the terminal. The correct check is already on line 44: **if the status is NOT in the workflow stages, it's orphaned**. The bug is the secondary filter on line 65 that incorrectly skips middle-orphaned KPIs.

**New logic for orphaned KPIs at a removed middle stage:**
- Instead of always moving to `approved`, advance the KPI to the **next valid stage** in the workflow that comes after its current canonical position.
- Example: KPI at `hr_pms_review` (canonical 5), workflow has `audit` (canonical 6) → move to `manager_check` (the stage before `audit`) so the auditor sees it as pending.
- If the KPI is past ALL non-approved stages → move to `approved` (current behavior, still correct for past-terminal cases).

Updated migration:
```sql
-- For orphaned KPIs: find the next workflow stage after the KPI's canonical position
-- and set the status to the stage BEFORE that (so the next reviewer picks it up)
-- If past all stages → approved
```

#### Part 2: Reports — Flag Workflow-Mismatched KPIs

In the three performance reports, after fetching KPIs, cross-check each KPI's `status` against its employee's resolved workflow. If the status doesn't exist in the workflow, show a **"Workflow Mismatch"** warning badge instead of the raw status.

This is a lighter touch than the reconcile — it surfaces the problem visually so admins can take action.

**Changes in each report:**
- Fetch employee workflows in bulk using `get_bulk_employee_workflows` RPC (already exists)
- For each KPI row, check: `if (!employeeWorkflow.includes(kpi.status))` → show amber "Orphaned" badge
- Add a summary stat card: "Workflow Mismatches: N" with a warning icon

#### Part 3: Proactive Detection Banner

Add a small alert banner on the **Admin Dashboard** and **Workflow Config** page when orphaned KPIs exist for the current period. Uses a lightweight count query calling `reconcile_workflow_statuses` with `dry_run = true`.

### Implementation Plan

1. **Database migration** — Replace `reconcile_workflow_statuses` function with corrected logic that handles middle-stage orphans by advancing to the correct next stage (not always `approved`)
2. **`src/pages/reports/KpiStatusTracker.tsx`** — Add workflow mismatch detection and "Orphaned" badge
3. **`src/pages/reports/EmployeePerformanceSummary.tsx`** — Same orphan detection + badge
4. **`src/pages/reports/KpiDetailReport.tsx`** — Same pattern
5. **`src/components/admin/ReconcileOrphanedKpisDialog.tsx`** — Update UI to show the corrected new_status (not always "Approved") and explain where the KPI will move

### Files

**New:** DB migration (updated `reconcile_workflow_statuses` function)

**Modified:**
- `src/pages/reports/KpiStatusTracker.tsx` — orphan badge + mismatch count
- `src/pages/reports/EmployeePerformanceSummary.tsx` — orphan badge
- `src/pages/reports/KpiDetailReport.tsx` — orphan badge
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx` — show correct target status per KPI


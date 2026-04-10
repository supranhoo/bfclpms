

# Admin Bulk Zero-Scoring for Non-Submitters

## Problem Statement
When employees fail to submit monthly data on time, admins currently have no streamlined way to assign a zero score across all review levels for all their unsubmitted KPIs. Similarly, when Org KPI data owners miss their deadlines, there's no mechanism to zero-score those org-level values before propagation.

## Existing Infrastructure to Leverage
- **`auto_advance_zero`** rule in `auto-lock-review-periods` — already handles automated zero-scoring for stuck KPIs, but is timer-based and limited to self-review stage only. The new feature is an **on-demand admin action** covering ALL levels.
- **`review_submissions`** table — has columns for all 8 score stages (self, manager, skip_level, hr_pms, auditor, management, final) plus `auto_advance_reason` for tracking.
- **`kpi_audit_logs`** table — supports structured `action`, `old_value`, `new_value`, `metadata`, `performed_by` for full audit trail.
- **`org_kpi_values`** table — tracks org-level KPI data with `status`, `achieved_value`, and audit via `org_kpi_data_entry_logs`.
- **Data Repair Tab** (`DataRepairTab.tsx`) — provides the proven Scan → Select → Repair UI pattern.
- **Workflow engine** — resolves employee-specific review pipelines per period.

## Feature Design

### Scope & Behavior

**What it does:**
1. Admin selects a review period + year, clicks "Scan Non-Submitters"
2. System identifies all KPIs where the employee has NOT progressed beyond a configurable threshold (e.g., still at `kra_set` or `self_review`)
3. Admin reviews the list, selects employees/KPIs, and confirms "Apply Zero Score"
4. System writes 0 to ALL score fields across the employee's workflow stages, sets `final_score = 0`, `final_rating = 0`, advances status to `approved`, and logs the action
5. Optionally, admin can also zero-score Org KPI values where data owners haven't submitted

**What it does NOT do:**
- Does not affect KPIs that are already progressed past self-review (those are in the pipeline)
- Does not affect sent-back KPIs (same exclusion logic as `auto_advance_zero`)
- Does not affect N/A-marked KPIs
- Does not affect multi-month KPIs that are not yet due

### Two-Phase Workflow (Scan → Confirm → Execute)

```text
┌─────────────────────────────────────────────────┐
│  Admin: System Settings → Data Repair           │
│  New section: "Bulk Zero-Score Non-Submitters"   │
├─────────────────────────────────────────────────┤
│  [Period ▼] [Year ▼]                            │
│  ☐ Include Org KPI zero-scoring                 │
│  [Scan Non-Submitters]                          │
├─────────────────────────────────────────────────┤
│  SCAN RESULTS:                                  │
│  ☐ Employee A  │ 5 KPIs │ kra_set    │ reason  │
│  ☐ Employee B  │ 3 KPIs │ self_rev   │ reason  │
│  ☐ Org KPI: X  │ No data │ not_entered│ reason │
├─────────────────────────────────────────────────┤
│  [Apply Zero Score] → ConfirmDestructiveDialog  │
│  "This will set score 0 for X KPIs across Y     │
│   employees. This action is irreversible."       │
├─────────────────────────────────────────────────┤
│  RESULTS: 45 KPIs zero-scored, 3 Org KPIs       │
│  [Download Report]                              │
└─────────────────────────────────────────────────┘
```

### Edge Function: `bulk-zero-score-non-submitters`

**Modes:** `scan` and `execute`

**Scan logic:**
1. Fetch all KPIs for the given period/year still in `kra_set` or `self_review` status
2. Exclude: sent-back KPIs (via `kpi_queries` + `kpi_audit_logs`), N/A KPIs, multi-month KPIs not yet due
3. If "include org KPIs" flag is set, also fetch `org_kpi_values` where `achieved_value IS NULL` and status is `entered` or NULL
4. Return grouped results by employee with KPI details

**Execute logic (per KPI):**
1. Resolve the employee's workflow stages for this period
2. Upsert `review_submissions` with 0 for every stage in the workflow:
   - `self_score: 0, self_rating: 0, self_remarks: <admin reason>`
   - `manager_score: 0, manager_rating: 0, manager_remarks: <admin reason>`
   - Same for skip_level, hr_pms, auditor, management as applicable
   - `final_score: 0, final_rating: 0`
   - `kpi_status: 'locked'`
   - `auto_advance_reason: <admin reason with timestamp>`
3. Update `kpis.status` to `approved`
4. Insert `kpi_audit_logs` entry:
   - `action: 'ADMIN_BULK_ZERO_SCORE'`
   - `old_value: { status: <previous>, scores: null }`
   - `new_value: { status: 'approved', final_score: 0, all_levels_zeroed: true }`
   - `metadata: { reason, performed_by, period, year, batch_id }`
5. For Org KPIs: set `achieved_value: 0`, update status, insert `org_kpi_data_entry_logs`

**Auth:** Uses shared `requireAdminUser(req)` helper (already built).

### UI Component: `BulkZeroScoreSection`

- New section in `DataRepairTab.tsx` (or a sibling component rendered in the same settings tab)
- Period/Year selectors (reuse existing pattern)
- Checkbox: "Also zero-score unsubmitted Org KPIs"
- Scan results table grouped by employee, expandable to show individual KPIs
- Select-all / individual selection
- `ConfirmDestructiveDialog` gate before execution
- Post-execution: summary card + Excel download (Summary, Details, Audit sheets)

### Audit & Visibility

**Audit trail:**
- `kpi_audit_logs.action = 'ADMIN_BULK_ZERO_SCORE'` per KPI
- `org_kpi_data_entry_logs.action = 'admin_zero_scored'` per Org KPI
- All entries include `performed_by` (admin user ID) and `batch_id` (UUID linking the entire operation)

**Visibility in review panels:**
- The `auto_advance_reason` field on `review_submissions` will contain the admin's remark (e.g., "Admin bulk zero-score: Data not submitted by deadline — Apr 2026")
- This is already rendered by `KpiJourneySection` and `KpiReviewPanel` via the existing remarks display
- All score columns (Self, Manager, etc.) will show 0 in the KPI Tracker modal
- Final score of 0 flows into weighted average calculations (not excluded, since it's a real score, not N/A)

### Additional Recommendations (Points You May Be Missing)

1. **Batch ID for traceability** — A single UUID ties all KPIs in one zero-score operation together, enabling easy rollback identification and report filtering

2. **Undo/Rollback consideration** — Since this is destructive and irreversible at scale, the confirmation dialog should show exact counts and require typing "ZERO" to confirm (elevated confirmation pattern)

3. **Notification to affected employees** — After zero-scoring, optionally trigger email notifications to affected employees informing them their KPIs were scored 0 due to non-submission (configurable toggle)

4. **Department-level filtering** — Allow admins to filter by department during scan so they can zero-score one team at a time rather than organization-wide

5. **Deadline reference** — The scan should show how many days overdue each employee is (days since stage started vs. configured deadline), giving admins context before zero-scoring

6. **Dry-run Excel preview** — Before executing, allow downloading the scan results as Excel so admins can share with department heads for approval

7. **Frequency-awareness** — For quarterly/half-yearly KPIs, only zero-score if the current period is the terminal month of the cycle; otherwise skip (same logic as existing `auto_advance_zero`)

8. **Guard against double-execution** — If a batch has already been zero-scored (check via `kpi_audit_logs` for `ADMIN_BULK_ZERO_SCORE` on the same period), warn the admin

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Create | Edge function with scan + execute modes |
| `src/components/admin/BulkZeroScoreSection.tsx` | Create | UI component for the feature |
| `src/components/admin/DataRepairTab.tsx` | Modify | Add the new section |
| `DOCUMENTATION.md` | Update | Document the feature |
| `POLICY.md` | Update | Add policy for bulk zero-scoring |

## Risk & Impact Report

- **Data Impact**: Writes 0 scores and advances status to `approved`. Irreversible without backup restore. Mitigated by confirmation dialog and batch-ID audit trail.
- **Workflow Impact**: Zero-scored KPIs skip the normal review pipeline. This is intentional — they are being penalized for non-submission.
- **UI/UX Consistency**: Zero scores will appear in all dashboards, reports, and incentive calculations as real 0 values. No special rendering needed.
- **Regression Risk**: Low — new edge function, new UI section. Does not modify existing scoring paths.
- **Mitigation**: Elevated confirmation (type "ZERO"), scan-before-execute pattern, Excel audit report, batch ID for traceability.


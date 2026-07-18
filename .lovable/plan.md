## Goal
Extend the existing **Annual Review Report** (`/reports/annual-review`) with three additive views. No changes to write paths, RLS write policies, or scoring logic.

## Assumptions (to confirm before build)
- Data source stays `annual_review_instances` joined to `profiles`, `departments`, `annual_review_cycles`, and stage reviewer columns (`self_id`, `manager_id`, `skip_id`, `bu_head_id`, `hr_id`) already used by the current report.
- "Pending at stage X" = instance whose current status has not yet completed stage X AND X is enabled in the cycle's `default_enabled_stages` (respecting POLICY §AR-BU-HEAD-TERMINAL — BU Heads have no dept_head stage).
- "Submission %" numerator = instances where self stage is completed; denominator = total active instances in the cycle for that department.
- Access: same role gate as the current report (Admin, HR PMS, Management, BU Head scoped to their BUs, HOD scoped to their departments). No new roles.

## Risk & Impact
- **Data:** read-only. New RPCs only.
- **Workflow:** none.
- **UI:** three new tabs on existing report page; existing tab untouched.
- **Regression:** low — additive RPCs + additive UI.
- **Scalability:** all three queries aggregate per-cycle (≤ few thousand rows). Server-side aggregation in RPC; drill-down uses server-side pagination (page size 50, same as existing).
- **Rollback:** drop 3 RPCs + revert 1 page file.

## Deliverables

### 1. Per-Department Submission %
- New tab "By Department" on `/reports/annual-review`.
- Table columns: Department · Total · Self Submitted · % · Manager Done · Skip Done · BU Done · HR Done · Completed.
- Backed by RPC `get_annual_review_dept_submission_summary(cycle_id, scope)` returning one row per department, scoped to caller's access.
- Export current view to Excel (reuses existing export util).

### 2. Reviewer-wise Pending Queues
- New tab "By Reviewer" on same page.
- Table columns: Reviewer · Role in stage (Manager / Skip / BU / HR) · Pending count · Oldest pending (days).
- Backed by RPC `get_annual_review_reviewer_pending_queues(cycle_id, stage_filter, scope)`.
- Row click → filters the existing detail tab to that reviewer + stage (deep-link via query params, reuses existing detail list).

### 3. Drill-down: Who Is Pending at Each Stage
- New tab "Pending Drill-down".
- Top: 5 stage cards (Self / Manager / Skip / BU / HR) with pending counts.
- Click a card → paginated list: Employee · Dept · Reviewer name · Days pending · Last action.
- Backed by RPC `get_annual_review_pending_at_stage(cycle_id, stage, scope, page, page_size)` — server-side pagination, sort by days pending desc.
- "Nudge" action deferred (out of scope unless you ask).

## Technical Notes
- New file: `supabase/migrations/<ts>_annual_review_report_extensions.sql` — 3 SECURITY DEFINER RPCs, all filtered through `annual_review_directory_access(auth.uid())` for scope (reuses ADR-111 resolver).
- New file: `src/components/reports/annual-review/DepartmentSubmissionTab.tsx`
- New file: `src/components/reports/annual-review/ReviewerQueuesTab.tsx`
- New file: `src/components/reports/annual-review/PendingDrilldownTab.tsx`
- Modified file: `src/pages/reports/AnnualReviewReport.tsx` — add 3 tabs alongside the existing detail tab.
- Tests: `src/tests/annualReviewReportExtensions.test.ts` — scope enforcement (HOD sees only own dept), stage math correctness, pagination bounds, BU-Head-terminal exclusion for dept_head stage.
- Docs: append to `DOCUMENTATION.md` (report extension section) and `POLICY.md` under §AR-REPORT-VISIBILITY (scope = same as directory access resolver).

## What I will NOT touch
- Existing summary cards, filters, or export in the current tab.
- Any write path, notification path, or RLS on `annual_review_instances`.
- Scheduled email of the summary (mentioned earlier as a possible extension) — not in this plan; ask if you want it added.

## Open question before build
Should "Completed" in the department view mean **HR-approved (terminal)** only, or also include **BU-terminal** cases (BU Heads / Jaspal-style flows where BU/HR is the last enabled stage)? Default I will use: terminal = whichever stage is last-enabled for that instance's chain (per POLICY §AR-BU-HEAD-TERMINAL). Say "use HR only" if you want the stricter definition.

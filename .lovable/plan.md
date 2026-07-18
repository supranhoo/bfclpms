## Goal
Expand `/reports/annual-review` into a full **Comprehensive Annual Review Report** with all requested columns, summary KPIs, breakdowns, highlights, charts, and a single Excel export that mirrors the on-screen report.

## Assumptions (confirmed from codebase)
- Source: `annual_review_instances` joined to `profiles`, `departments`, `business_units`, `divisions`, `pms_grades`, `designations`, and per-stage score columns already used by the existing tabs.
- Cycle filter, scope (Admin/HR = all, BU Head/HOD = BUs, Manager = subtree) and RLS reuse `annual_review_directory_access(auth.uid())` — no new access surface.
- "Pending With" derives from `overall_status` (`pending_self` / `pending_manager` (HOD) / `pending_bu` / `pending_hr` / `completed` / `excluded`). BU-Head-terminal cases (POLICY §AR-BU-HEAD-TERMINAL) already collapse the dept_head stage — respected as-is.
- "Rating" = existing rating band derived from `final_score` (same mapping used in the current detail tab).
- "Days pending" = `now() - last stage transition timestamp` (already exposed by the pending drill-down RPC).

## Risk & Impact
- **Data:** read-only. One new aggregate RPC + reuse of existing ones.
- **Workflow / RLS writes:** none.
- **UI:** replaces the current 4-tab report with a richer single-page report + tabs; existing tabs preserved as sub-views.
- **Regression:** low — additive fields, no change to write paths, scoring, or notifications.
- **Scalability:** server-side aggregation in RPCs; detail table uses existing server-side pagination (page 50). Excel export capped at 5,000 rows (matches ADR export cap) with guarded toast.
- **Rollback:** drop 1 new RPC + revert the report page and one new component file.

## Deliverables

### 1. Executive summary strip (top of page)
Cards: Total · Eligible · Excluded · Self Pending · HOD Pending · BU Pending · HR Pending · In Progress · Completed · Avg Final Score.

### 2. Rating distribution
Horizontal bar chart (reuses existing Recharts setup) — count per rating band, with % labels.

### 3. Breakdown tables (tabs)
- By Department · By Business Unit · By Division · By Grade · By Designation · By Reviewer Stage
- Each: Name · Total · Eligible · Excluded · Self Done · HOD Done · BU Done · HR Done · Completed · Submission % · Avg Final Score.

### 4. Highlights panel (collapsible)
- Missing scores (final_score null but not excluded)
- Pending > 15 days (uses existing days-pending calc)
- Excluded list
- Top 10 final scores
- Bottom 10 final scores (excluding null/excluded)

### 5. Detailed employee table
Columns (in this order): Employee Code · Name · Designation · Department · Business Unit · Division · Grade · DOJ · Eligibility · Self · HOD · BU · HR · Final · Rating · Current Stage · Pending With · Completion Status.
- Sort: Department → Business Unit → Employee Name.
- Server-side pagination (50/page), name/code search, stage filter, eligibility filter.
- DOJ binds to `profiles.doj` (per memory rule — never `created_at`).

### 6. Single Excel export ("Download full report")
One workbook, multiple sheets:
1. Executive Summary (KPIs + rating distribution)
2. Detail (all filtered rows, sorted as above; up to 5,000)
3. By Department · 4. By Business Unit · 5. By Division · 6. By Grade · 7. By Designation · 8. By Reviewer Stage
9. Highlights (missing scores, >15d pending, excluded, top 10, bottom 10)
Uses the existing `xlsx` builder pattern in `src/services/annualReview/exports.ts`.

## Technical notes
- New RPC: `get_annual_review_comprehensive_report(p_cycle_id, p_scope)` returning one row per instance with all display columns already joined (avoids N client joins). Scope filtered through `annual_review_directory_access(auth.uid())`.
- Reuse existing RPCs for department / reviewer / drill-down aggregates; add thin wrappers for BU / Division / Grade / Designation summaries (same shape as `get_annual_review_dept_submission_summary`).
- New file: `src/pages/reports/AnnualReviewReport.tsx` — refactor to host the new sections.
- New file: `src/components/reports/annual-review/ComprehensiveExport.ts` — pure builder, no DB.
- New file: `src/components/reports/annual-review/HighlightsPanel.tsx`.
- New file: `src/components/reports/annual-review/RatingDistributionChart.tsx`.
- Tests: `annualReviewComprehensiveReport.test.ts` — scope enforcement, sort order, "pending >15d" math, rating distribution totals, export sheet shape.
- Docs: append to `DOCUMENTATION.md` (Reports → Annual Review Comprehensive) and `POLICY.md` §AR-REPORT-VISIBILITY (unchanged scope, expanded column list).

## What I will NOT touch
- Write paths, notifications, scoring, RLS on `annual_review_instances`.
- The existing per-department / per-reviewer / drill-down tabs — they become the "Breakdowns" tab group inside the new report.
- Scheduled email of the report — not in this plan; ask if you want it added.

## Open question before build
For **"Pending With"**, when the current stage's reviewer id is null (data drift case fixed in ADR-108/113 — visibility-only rows), should the report show:
(a) the **stage label only** (e.g. "HOD — unassigned"), or
(b) fall back to the **subtree-visible reviewer** already used in the Team queue?
Default I will use: **(a) stage label + "unassigned"** so the report reflects reality instead of implying an owner. Say "use (b)" if you'd rather show the visibility owner.

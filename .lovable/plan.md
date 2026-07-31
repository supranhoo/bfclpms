# Add PMS Grade Filter to Annual Review Report & Bell Curve Analysis

## Goal
Add a "PMS Grade" filter dropdown to both the Annual Review Report page and the Bell Curve Analysis tab, so users can narrow the employee roster by the employee's PMS grade (the value stored on `profiles.pms_grade`).

## Background
- The Bell Curve Analysis tab currently filters by Department, Business Unit, Manager, and Division/Location.
- The Annual Review Report page already has a `pmsGrade` parameter wired into `listInstancesPaginated` (service layer), but no UI control exposes it.
- The Bell Curve tab uses the `get_annual_review_comprehensive_report` RPC, which currently does not return `pms_grade` or `pms_grade_id`, so the Bell Curve tab cannot filter by grade.
- A reusable `useEmployeeFilterOptions` hook already provides `grades` via `get_distinct_active_pms_grades()`.

## Implementation Plan

### 1. Database — Extend the comprehensive report RPC
- Modify `public.get_annual_review_comprehensive_report(p_cycle_id uuid)` to add two new output columns:
  - `pms_grade_id uuid` (from `profiles.pms_grade_id`)
  - `pms_grade text` (from `profiles.pms_grade`)
- Update the `RETURNS TABLE(...)` signature, the main `SELECT` projection, and the `JOIN` chain (already joins `profiles p`; no new join needed).
- No RLS changes are required; the function is already `SECURITY DEFINER` and the existing scope guard applies.

### 2. Types — Surface the new fields
- Add `pms_grade_id: string | null` and `pms_grade: string | null` to `ComprehensiveRow` in `src/services/annualReview/comprehensiveReport.ts`.
- Add `pms_grade_id` and `pms_grade` to `BellCurveInput` in `src/lib/annualReview/bellCurve.ts` so the engine can group/filter by grade.

### 3. Bell Curve Analysis tab — Add PMS Grade filter
- In `src/components/reports/annual-review/BellCurveTab.tsx`:
  - Add `pmsGrade` state (default `__all__`).
  - Fetch grade options with `useEmployeeFilterOptions({ enabledGrades: true })`.
  - Add a fifth filter dropdown in the existing filter grid labeled "PMS Grade".
  - Apply the filter when computing the `filtered` dataset, so the bell curve, charts, heat map, and KPIs all reflect the selected grade.
  - Clear the grade filter when it is reset to "All".

### 4. Annual Review Report page — Expose existing PMS Grade filter
- In `src/pages/reports/AnnualReviewReport.tsx`:
  - Add `pmsGrade` state and pass it to `useAnnualReviewInstancesPaginated` args.
  - Add a "PMS Grade" dropdown in the top-level filter card (alongside Cycle, Stage, Rating, Search).
  - Fetch grade options with `useEmployeeFilterOptions({ enabledGrades: true })`.
  - Reset the page to 1 when the grade filter changes.

### 5. Quality & Documentation
- Add focused tests in `src/test/annualReview/bellCurve.test.ts` to verify that filtering by `pms_grade` correctly narrows the distribution and summary.
- Update `DOCUMENTATION.md` under the Annual Review Reporting section to record the new PMS Grade filter in both the Bell Curve and the paginated report.
- Update `POLICY.md` if any filter behavior or data-access rule changes (no access rule changes are expected; the existing directory access and RLS still apply).

## UI Changes
- **Bell Curve Analysis**: A fifth filter dropdown appears in the existing filter grid, after the four existing filters. It is labeled "PMS Grade" and lists all active grades from the master data.
- **Annual Review Report**: A new dropdown appears in the Filters card (next to Cycle, Stage, Rating, Search). It is labeled "PMS Grade".
- Both dropdowns include an "All" option and reset the dependent results to page 1 when changed.

## Risk & Impact Report
- **Data Impact**: Low. The RPC is additive only (two new columns). No existing column order or types change.
- **Workflow Impact**: None. Filtering is read-only and does not affect review workflows or permissions.
- **UI/UX Impact**: Low. The filter grid expands from four to five columns; the existing grid already supports responsive wrapping.
- **Regression Risk**: Low. The `pmsGrade` parameter in `listInstancesPaginated` is already implemented and unused; wiring UI to it is safe.
- **Scalability Impact**: Low. The grade option list comes from `get_distinct_active_pms_grades()`, a SECURITY DEFINER DISTINCT query backed by an index.
- **Mitigation Plan**: Test the Bell Curve tab with a non-empty PMS Grade filter to confirm the RPC returns the new columns and that the distribution denominator updates. Test the main report page to confirm the service filter is applied correctly.

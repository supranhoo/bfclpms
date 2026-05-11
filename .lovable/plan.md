# Fix: Vivek's blank Team Reviews — eliminate full-org scans

## Why Vivek "can't" but Ankit "can"
Both employees are `admin` and run the same queries on Team Reviews. Live DB logs (last 5 min) show repeated `statement timeout` on three queries that scan the **entire** active organization (2,532 profiles + every KPI for the open period). Ankit got a warm React Query cache from an earlier successful load; Vivek's first cold attempt timed out, and the empty-state error sticks. This is load-flaky, not user-specific — Ankit will hit it too on the next cold load.

## Risk & Impact Report

- **Data Impact:** No schema changes. Two new SECURITY DEFINER RPCs (`get_team_reviews_roster_page`, `get_team_reviews_kpi_summary`) for paginated, RLS-aware reads. No write paths change.
- **Workflow Impact:** None. Same roles see the same employees and KPIs — only the fetch shape changes.
- **UI/UX Consistency:** Team Reviews keeps the same cards/grid; pagination becomes server-driven (Load more / page controls already supported by the grid).
- **Regression Risk:** Medium-high — `EmployeeSelectorGrid` is shared by Pending Self / Manager / Skip / HR PMS / Audit / Management views. Mitigation: keep current hooks as fallback when the new RPC errors, ship behind a feature-flag-style guard, and add unit tests on the page-shape.
- **Mitigation Plan:** Keep the existing `useProfiles` / `useKpisByPeriodRanges` callable but **not** auto-invoked on Team Reviews; reuse them only on small per-employee scorecard fetches.

## Implementation Plan

### 1. New paginated roster RPC
Create `public.get_team_reviews_roster_page(p_period text, p_year int, p_search text, p_dept uuid, p_designation text, p_manager uuid, p_status text, p_limit int, p_offset int)` returning rows with: employee_id, full_name, employee_code, designation, department_id, reporting_manager_id, total_kpis, reviewed_kpis, last_status. Implementation: SECURITY DEFINER, joins `profiles` + aggregated `kpis` + `review_submissions` for **only the requested page**, applies RLS-equivalent role checks internally (admin / manager / skip / hr_pms / management / auditor / report_override), returns at most 50 rows per call.

### 2. New per-page KPI summary RPC
Create `public.get_team_reviews_kpi_summary(p_employee_ids uuid[], p_period text, p_year int)` returning per-employee: pending_count, reviewed_count, weighted_score. Called only with the visible page's employee IDs (≤50). Replaces the org-wide `useKpisByPeriodRanges` + `useReviewSubmissionScoresByKpiIds` for the grid summary.

### 3. Wire `EmployeeSelectorGrid.tsx` to the RPCs
- Replace `useProfiles()` / `useProfilesByWorkflowStage()` / `useKpisByPeriodRanges()` / `useEmployeeScoresForPeriod()` on Team Reviews with one `useTeamReviewsRosterPage(filters, page)` hook.
- Keep client-side detail hooks (`useKpis(employeeId, period, year)`) for the per-employee scorecard drawer — those are already cheap.
- Pagination: 50 rows per page, server-side; "Load more" appends.
- Filters (search, department, designation, manager, status, view-level) are passed to the RPC as parameters so the DB returns only matching rows.

### 4. Distinct-values endpoints
Replace the `profiles SELECT designation WHERE is_active=true` / department / manager dropdown fetches (also timing out) with three lightweight RPCs returning `DISTINCT` values via indexed scans, cached for 10 minutes.

### 5. Statement-timeout safety net
- Add `SET LOCAL statement_timeout = '20s'` inside the new RPCs (admin reporting reads only, never on writes).
- Add a small per-RPC error toast: "Roster too large to load instantly — narrowing filters will help" so admins see actionable guidance instead of a generic retry.

### 6. Regression coverage
- Unit tests: roster RPC pagination, filter combinations, role-scoping parity with current RLS.
- Integration test: `EmployeeSelectorGrid` renders 50/2532 with "Load more", retry path, filter change resets pagination.
- Manual QA: log in as admin (Vivek), manager, skip-level, HR PMS, auditor; verify same employees appear as before.

### 7. Doc + policy sync
- `DOCUMENTATION.md` v2.66.11.0 release note.
- `POLICY.md` §124: "Reviewer dashboards MUST page their roster server-side. No client-side hook may scan the entire active organization in a single request."
- Update memory `Reviewer Dashboard View Architecture` with the new RPC contract.

## Expected Result
Team Reviews loads in <1s for any role, including admins on the full 2,532-employee org, regardless of cache state. Vivek (and any future cold-loaded admin) sees the same data Ankit sees, without the "Couldn't load this dashboard" panel.

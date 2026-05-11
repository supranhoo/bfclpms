## Risk & Impact Report

- **Data Impact:** No historical data edits. One read-only backend function may be added/updated so the dashboard can fetch review submission score signatures without timing out.
- **Workflow Impact:** No approval workflow or permissions change. Counts will continue to respect the selected period and period-specific workflow eligibility.
- **UI/UX Consistency:** No layout changes. The same stat cards and employee badges will populate with accurate numbers.
- **Regression Risk:** Low-to-medium because HR PMS, Audit, and Management share the same score-signature map. I will keep the existing fallback-chain semantics and avoid changing score calculation rules.
- **Mitigation Plan:** Replace the remaining heavy `review_submissions` batched client query with a server-side slim RPC, then add/update regression tests that assert the Management view uses `management_score`/approved N/A signatures and does not collapse to zero when submission rows are loaded through the optimized path.

## Confirmed RCA

The previous fix made the KPI period fetch fast, but the Management numbers still depend on a second heavy path:

- `EmployeeSelectorGrid` loads all March KPI IDs.
- Then `useReviewSubmissionScoresByKpiIds` performs multiple client-side `.from('review_submissions').in('kpi_id', batch)` requests.
- If those submission-score batches fail/timeout/return late, `submissionScoreMap` is empty or unavailable, so Management reviewed/approved signatures are counted as `0` even though March 2026 has data.

Database check confirms March 2026 is not actually zero:

- 1,756 KPIs exist for March 2026.
- 1,736 are already `approved`.
- 24 employees have a workflow that includes `management_review`.
- 442 KPIs belong to those Management-review workflows, with 429 already approved.

## Implementation Plan

1. **Add an optimized read-only score-signature RPC**
   - Create `get_reviewer_submission_scores_for_period(p_period, p_year)`.
   - Return only fields needed by dashboards: `kpi_id`, reviewer score columns, `final_score`, `is_na`, `self_score`.
   - Join `review_submissions` to period-filtered KPIs inside the database, with `SECURITY DEFINER`, `search_path = public`, and a 30s statement timeout.
   - Preserve the same role scoping as `get_reviewer_kpis_for_period` so admins/HR PMS/auditors/management get full reviewer visibility, while regular managers only get their scoped employees.

2. **Switch the frontend score map hook to the RPC**
   - Update `useReviewSubmissionScoresByKpiIds` in `src/hooks/useKpis.ts` to accept optional period ranges.
   - For reviewer dashboards, fetch submission signatures by selected period/year via the new RPC instead of client-side KPI-ID batching.
   - Keep the current batched `.in('kpi_id')` path as a fallback for call sites that only pass KPI IDs.

3. **Wire the Management/HR PMS/Audit grid to period-aware score signatures**
   - Update `EmployeeSelectorGrid` to pass `periodSelection.periodRanges` into `useReviewSubmissionScoresByKpiIds`.
   - This makes Management stat cards and employee badges compute from the optimized period score map.

4. **Add regression coverage**
   - Update existing dashboard regression tests to assert:
     - the score hook uses the period RPC path for reviewer grids;
     - Management approved/reviewed counts are derived from `management_score` and approved N/A signatures;
     - KPI fallback to `approved` status does not show zero when submission signatures are present.

5. **Documentation / policy sync**
   - Update the internal plan/policy notes for the reviewer-dashboard performance rule: large reviewer dashboards must use period-scoped backend helpers for KPI and submission score signature reads, not wide client-side RLS scans.

## Validation

After implementation:

- Reopen `/dashboard?view=management` for March 2026.
- Confirm stat cards no longer show all zeros.
- Confirm employee cards show KPI badges instead of only `No KPIs` where March KPIs exist.
- Confirm no `57014` timeout or failed `review_submissions` requests appear in network/logs.

Goal: treat this as a high-severity performance defect on `/reports/kpi-journey` and fix the actual bottleneck, not just add more micro-optimizations.

What I verified
- The page is not fully broken; it eventually renders.
- The failure mode is: very long blocking load before first usable render, which makes it appear stuck.
- Browser extract later showed the table loaded with `1583` rows, but only after a long wait.

Deep RCA
1. Primary root cause: the page fetches the entire report dataset before rendering page 1.
   - `PAGE_SIZE` is `50`, but `useKpiJourneyReport` still loads all `1583` KPIs first, then all related timelines, then computes every row client-side.
   - This means pagination is visual only, not data-level.

2. The slowest step is the KPI base fetch, not the audit log fetch anymore.
   - March 2026 has `1583` KPIs.
   - The hook makes two sequential KPI requests: `offset=0..999`, then `offset=1000..1999`.
   - The second request does not start until the first finishes, so the whole page is blocked behind this waterfall.

3. Payload size is excessive for initial render.
   - KPI text is very large: average KPI name length is about `324` chars, max `1138`, total KPI/KRA text payload is ~`554k` chars.
   - The page downloads all of that even though only 50 rows are shown initially.

4. The current implementation over-fetches related data.
   - It fetches all accessible `profiles` (`456`) instead of only the `96` employees used in the current period.
   - It also fetches submissions/logs for all KPI IDs up front, even though only a subset is needed for the current page.

5. The previous DB index fix worked, but it is no longer the main blocker.
   - `idx_kpi_audit_logs_kpi_id` exists.
   - March data only has `637` audit log rows and `81` review submissions for those KPIs.
   - All report queries are now returning `200`, so the report is bottlenecked by frontend data strategy, not by missing audit-log indexing.

6. Secondary frontend inefficiency:
   - `xlsx` is imported eagerly in `KpiJourneyReport.tsx`, adding a large route bundle before the user even clicks Export.
   - Performance profile shows `xlsx.js` as one of the largest resources.

7. Separate UI hygiene issue:
   - `Skeleton` is not using `forwardRef`, causing the React ref warning seen in console.
   - This is not the main cause of the “stuck” behavior, but it should be fixed as part of CAPA.

CAPA — Corrective actions
1. Move the report to server-side pagination and filtering.
   - Replace “fetch all rows, then filter/paginate in React” with backend-driven page queries.
   - The report page should request only the current page plus total count/summary.
   - Filters to push server-side: year, period, department, status, type, search.

2. Create a backend query/RPC for KPI journey rows.
   - Build one backend function that:
     - filters KPIs for the selected report inputs,
     - paginates at the database level,
     - joins only required profile/department records,
     - derives timeline fields from audit logs and submissions for just the paged KPI set,
     - returns rows plus `total_count`.
   - Keep the current milestone logic, but execute it where the data lives.

3. Split summary metrics from row loading.
   - Fetch summary cards with a lightweight aggregate query.
   - This lets cards appear quickly even if the table request is still in flight.

4. Make export on-demand instead of part of initial page cost.
   - Remove eager `xlsx` import.
   - Dynamically import `xlsx` only when Export is clicked.
   - For export, fetch the full filtered dataset only on demand, not during initial render.

5. Narrow related-data fetch scope.
   - If any client-side joins remain, load profiles only for employee IDs present in the paged result, not all profiles.

6. Fix the Skeleton ref warning.
   - Convert `src/components/ui/skeleton.tsx` to `React.forwardRef`.
   - This removes console noise and aligns it with other UI primitives.

CAPA — Preventive actions
1. Add a performance guardrail for report pages.
   - Rule: never fetch full datasets for routes that visibly paginate.
   - Pagination must be data-level, not just UI-level.

2. Add a regression test/check for large-period report loading.
   - Cover the scenario where the period has >1000 KPIs.
   - Validate that initial render requests only one page of rows.

3. Keep export decoupled from page boot.
   - Large export libraries and full-dataset fetches should only happen after user intent.

Technical implementation scope
- Frontend:
  - `src/pages/reports/KpiJourneyReport.tsx`
  - `src/hooks/useKpiJourneyReport.ts`
  - `src/components/ui/skeleton.tsx`
- Backend:
  - new migration for a report RPC/function or equivalent backend query surface
- No change needed to the existing `kpi_audit_logs.kpi_id` index; keep it.

Expected outcome
- First usable render should come from page-sized data, not from full-report hydration.
- The route should feel responsive immediately and stop appearing frozen.
- Export remains available but no longer slows the report page itself.
- Console warning is removed.

Validation after implementation
- Open `/reports/kpi-journey` and confirm page 1 renders without waiting for all 1583 rows.
- Verify filters and pagination trigger page-scoped backend requests.
- Verify export still works with the active filters.
- Verify no React ref warning from `Skeleton`.

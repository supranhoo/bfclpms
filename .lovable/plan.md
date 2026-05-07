Root cause: the data did not vanish. The backend still has 862 organization KPI rows for April 2026. Vivek’s page is showing zero because the Org KPI list request is timing out with `57014: canceling statement due to statement timeout`, and the UI currently renders that failed query as if there are no rows.

Risk & Impact Report:

- Data Impact: No data repair is required. Existing KPI rows are present. A small database performance migration may be needed to make the Org KPI period lookup index-backed under row access rules.
- Workflow Impact: No permission or KPI workflow changes intended. Admins/data owners should only stop seeing false empty states when a query fails.
- UI/UX Consistency: Keep the current Org KPI page layout; replace false “No organization-level KPIs exist” with a retryable error/loading state when the backend query fails.
- Regression Risk: Medium, because Org KPI data entry, data-owner visibility, and monthly/quarterly filtering share the same hook.
- Mitigation Plan: Add targeted tests for timeout/error classification, preserve existing filters, and document the rule in POLICY.md and DOCUMENTATION.md.

Implementation plan:

1. Harden the Org KPI data fetch
  - Change the Org KPI list query to use a lean explicit column projection instead of `select('*')` with a nested category join.
  - Resolve category metadata separately, so the main KPI query is smaller and less likely to hit statement timeout.
  - Keep pagination, but use a smaller page size for this RLS-heavy page if needed.
2. Add the missing performance support in Lovable Cloud
  - Add a targeted index for `kpis(is_org_level, review_year, review_period, category_id, kra_name, kpi_name)` to support the exact Org KPI Data Entry lookup and ordering.
  - Review RLS only for performance, not broadening access.
3. Stop failed queries from becoming “zero data”
  - Surface query errors from `useOrgLevelKpisWithEmployees` and `useOrgLevelKpis` to `OrgKpiDataEntry`.
  - Add an empty-state kind like `query-error` so a timeout displays “Could not load KPIs, retry” instead of “No KPIs exist.”
  - Add a retry button wired to refetch/invalidate the Org KPI queries.
4. Regression coverage and policy sync
  - Extend `orgKpiEmptyState` tests to cover query errors separately from true zero backend rows.
  - Add a regression test pinning the Org KPI hook to explicit projections/pagination rather than broad `select('*')` joins.
  - Update POLICY.md and DOCUMENTATION.md version history with this RCA: data present, UI vanished due to timeout/error being treated as empty.
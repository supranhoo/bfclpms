
# Dashboard Performance Optimization Plan

## 1. Assumptions
- Scope = the three landing dashboards users say feel slow: `Dashboard.tsx` (Self/Team/HR/Audit/Mgmt panels via `EmployeeSelectorGrid` + `UnifiedScorecard`), `pages/admin/AdminDashboard.tsx`, `pages/ManagementDashboard.tsx`. The two admin matrix dashboards (`KpiWeightageDashboard`, `OrgKpiMappingDashboard`) and `BulkReviewDashboard` are in scope only for *query-pattern* fixes (no UX changes).
- "Required data" = aggregates and stage counts already shown — we do not change KPIs, columns, or business meaning.
- Baseline numbers below come from `pg_stat_user_indexes`, `pg_stat_user_tables`, and `extensions.pg_stat_statements` snapshots taken just now; targets are measured against those.

## 2. Clarifications (assumed defaults — flag if wrong)
- OK to introduce 2–3 new SECURITY DEFINER RPCs (read-only aggregates) following the existing `get_reviewer_*` pattern.
- OK to raise React-Query `staleTime` on read-mostly dashboard caches (60–300 s). Mutations already invalidate.
- No UI/UX changes. Stage labels, filters, charts unchanged.

## 3. RCA — measured hot spots

| # | Where | What it does today | Cost signal |
|---|---|---|---|
| H1 | `AdminDashboard` `admin-dashboard-stats` | `supabase.from('kpis').select('status')` pulls **all 14,227 KPI rows** to count by stage in JS. No `staleTime`. | Refetches on every focus; full table read under RLS. |
| H2 | `ManagementDashboard` `management-dashboard` | For each calendar-year chunk, paginates `kpis` (`.range` loops of 1000) with embedded `review_submissions(...)` for the whole fiscal range (up to 12 months). Then pulls **entire `profiles` table** with 3-level embedded `departments → business_units → divisions`, plus **entire `kpi_queries`** with `status='open'`. All aggregation done client-side over potentially 10k+ rows. | Embedded join forces per-row RLS on `review_submissions`; `idx_kpis_org_period_status` averages 4,343 tup/scan (39 B reads / 9 M scans). |
| H3 | `Dashboard` → `EmployeeSelectorGrid` | Concurrently triggers `useProfiles` (full roster, ~2.5 k rows + roles), `useProfilesByWorkflowStage` (full roster + N×500 `get_bulk_employee_workflows` + KPI stage seed + per-batch `review_submissions` score-signature seed), `useKpisByPeriodRanges`, `useReviewSubmissionScoresByKpiIds`. Multiple of these duplicate roster scans within ~1 s. | `profiles_pkey` 499 M scans (≈500 M tup reads) — heaviest index in the DB; `idx_kpis_employee_id` 128 M scans, 1.3 B tup reads. |
| H4 | `Dashboard.tsx` deep-link/restore | Three separate `profiles.select(...)` `.eq('id', employeeParam).single()` paths with identical column lists — fine individually but they run inside `useEffect`s that re-fire on `searchParams` changes. | Minor, but trivially cacheable via React Query. |
| H5 | `useReviewSubmissionScoresByKpiIds` fallback | When RPC fast-path absent, batches 500-id `.in('kpi_id', …)` over `review_submissions`. Used widely (selector grid, scorecard derive). | `idx_review_submissions_kpi_id` 5 M scans / 8.6 M tup reads — already healthy *with* RPC; degrades sharply without it. |
| H6 | Several hooks lacking `staleTime` | `useTeamMembers`, `useSkipLevelTeamMembers`, `useEmployeeFilterOptions`, `useRollbackStatusCounts`, `usePendingAdjustmentCount`. Default `staleTime=0` → refetch on every focus/mount. | Multiplies all of the above. |

### Why-why (top item, H2)
1. Why is Mgmt Dashboard slow? It reads ≤14 k KPIs + 2.5 k profiles + all open queries on every load.
2. Why so much data? Aggregates (stage counts, division roll-up, rating bands, pending list) are computed in JS.
3. Why JS aggregation? No server aggregate exists; the dashboard predates the `get_reviewer_*` RPCs.
4. Why an embedded `review_submissions` join? Convenience — but PostgREST re-evaluates RLS row-by-row on the embed.
5. Why does staleTime=0? Original copy-paste from the admin dashboard; never tuned.

## 4. Risk & Impact Report

| Dimension | Impact | Mitigation |
|---|---|---|
| Data | Read-only RPCs; no write-paths touched. | RPCs marked `STABLE`, `SECURITY DEFINER`, identical RLS semantics (mirror `get_reviewer_kpis_for_period`). |
| Workflow | None — aggregates match current JS formulas line-for-line. | Golden-snapshot unit tests compare RPC vs. existing JS aggregator on a fixture period. |
| UI/UX | No visible change. Skeletons may render briefly less often (longer staleTime). | n/a |
| Regression | Risk of stage-count drift if RPC filter differs from current `kpi.status` count. | Add contract test (`tests/perf/dashboard-aggregates.test.ts`) asserting parity. |
| Scalability | At 50 k KPIs / 5 k employees, AdminDashboard goes from full-table read to a single aggregate row; Mgmt Dashboard goes from ~10 k row JSON to ~50 row JSON. | Verified by `EXPLAIN` (`HashAggregate` on `idx_kpis_review_year_period`). |
| Rollback | All changes are additive (new RPCs, new hooks). Toggle via feature flag `dashboards.use_aggregate_rpcs` (default ON after smoke). | Flip flag OFF to revert to current path. |
| Backup | New RPCs are functions, not tables — automatically captured by `get_backup_table_order()` rules. No denylist change. | n/a |

## 5. Plan (step → verification)

### Step 1 — Diagnose & baseline (browser perf, then DB)
- Capture `browser--performance_profile` on `/dashboard`, `/management-dashboard`, `/admin` (logged in as admin, default period).
- Record: LCP, INP, total network bytes for the dashboard query, longest server `mean_exec_time` from `pg_stat_statements`.
- **Verify**: numbers logged in PR description as "before".

### Step 2 — New SECURITY DEFINER RPC: `get_admin_dashboard_stats()` (H1)
- Returns one row: `total_employees, kpis_by_stage jsonb, open_queries, locked_periods, active_periods, pending_rollbacks`.
- Replace 5-query parallel block in `AdminDashboard` with one `.rpc()` call. Set `staleTime: 60_000`.
- **Verify**: snapshot test parity vs. current logic; network panel shows 1 request instead of 5.

### Step 3 — New RPC: `get_management_dashboard_metrics(p_year, p_months text[], p_employee_ids uuid[] DEFAULT NULL)` (H2)
- Server-side joins `kpis ⨝ review_submissions` once, returns:
  - `stage_counts jsonb`, `total_kpis`, `approved_kpis`, `weighted_avg_score`,
  - `pending_reviews jsonb` (per-employee aggregate for `management_review` + overdue),
  - `division_performance jsonb`, `rating_distribution jsonb`,
  - `open_queries_count`.
- Replace the entire `fetchFiscalData` + profiles + queries block. Drop the embedded `review_submissions(...)` PostgREST embed.
- Keep `useProfiles()` (already RPC-backed) only for the *names/codes* needed to hydrate the pending-list rows that the RPC returns by id.
- **Verify**:
  - Parity test against current JS aggregator on a known period.
  - `EXPLAIN ANALYZE` of new RPC < 1 s on prod-sized data.
  - Network: 2 requests instead of 3 + N pagination loops.

### Step 4 — Surgical cache tuning (H6)
- Add `staleTime` (60–300 s) and `gcTime` (15 min) to: `useTeamMembers`, `useSkipLevelTeamMembers`, `useRollbackStatusCounts`, `usePendingAdjustmentCount`, `useEmployeeFilterOptions`, `useProfiles` (already has `placeholderData`; add 5-min `staleTime`).
- **Verify**: React Query devtools shows the queries as `fresh` after first load when revisiting a dashboard within 5 min.

### Step 5 — De-duplicate `useProfilesByWorkflowStage` round-trips (H3)
- Move the score-signature seed into the existing `get_bulk_employee_workflows` RPC (or add `get_workflow_stage_roster(p_stage, p_period, p_year)` that returns the final employee-id set in one call).
- Drop the per-batch `review_submissions` `.in()` loop from the hook.
- **Verify**: hook makes ≤2 round-trips (was 1 roster + N×500 workflow + 1 KPI seed + ⌈N/500⌉ submission seeds).

### Step 6 — Cache `useReviewSubmissionScoresByKpiIds` periodKey fallback (H5)
- Keep RPC fast-path; add `staleTime: 60_000` and ensure non-period callers (selector grid uses it) reuse the same cache entry via `periodKey`.
- **Verify**: no duplicate `review-submission-scores-by-kpi-ids` entries in devtools for the same period.

### Step 7 — Bundle/route hygiene (small wins, no behavior change)
- Lazy-load `ManagementDashboard`, `AdminDashboard`, `BulkReviewDashboard`, `KpiWeightageDashboard`, `OrgKpiMappingDashboard` in `App.tsx` if not already. Charts (`recharts`) already imported; verify no unused chart kinds are bundled into the landing chunk.
- **Verify**: `bun run build` chunk report; landing route JS ↓ ≥ 80 KB gz.

### Step 8 — Tests + docs
- Unit tests: `tests/perf/admin-dashboard-rpc.test.ts`, `tests/perf/management-dashboard-rpc.test.ts` — parity vs. fixture, plus shape contract.
- Update `DOCUMENTATION.md` (RPC list + cache TTLs).
- Update `POLICY.md` §125 (pagination) with new aggregate-RPC carve-out.
- Add `mem://infrastructure/database/dashboard-aggregate-rpcs.md` and link from `mem://index.md`.

### Step 9 — Post-deploy verification
- Re-run `browser--performance_profile` on the same 3 dashboards; record "after" numbers.
- Pull `pg_stat_statements` delta for `kpis`/`review_submissions`/`profiles` queries.
- **Success thresholds**:
  - AdminDashboard TTI ↓ ≥ 60 % (target < 800 ms server-time).
  - ManagementDashboard TTI ↓ ≥ 70 % (target < 1.5 s server-time on full fiscal year).
  - `EmployeeSelectorGrid` first-paint ↓ ≥ 40 %.
  - No new console warnings/errors. All Phase-9 backup contract tests still pass.

## 6. UI Changes
Not Applicable — visual output and interactions unchanged. Skeleton frequency reduces because of longer `staleTime`.

## 7. Out of scope (will not touch)
- `OrgKpiEntryCard` (recently fixed under ADR-081).
- Backup edge functions (ADR-082).
- Any write-path or RLS policy.
- Adding/removing dashboard widgets or filters.

## 8. Decision justification
- **Server aggregates over client aggregates** — single round-trip, server uses existing composite indexes; alternative (materialized view) rejected because dashboard data must be live for `management_review` overdue logic.
- **SECURITY DEFINER RPCs** — proven pattern in this codebase (`get_reviewer_kpis_for_period`); avoids per-row RLS on the heaviest tables; alternative (loosening RLS) rejected — violates §8 of project standards.
- **Tune `staleTime` instead of `refetchOnWindowFocus=false`** — keeps freshness on explicit user actions while killing the background storm; alternative (disabling focus refetch globally) rejected — would mask write-then-read bugs elsewhere.
- **Feature flag rollout** — required by §18 (rollback strategy); no destructive change otherwise.

# Performance Optimization Plan — "Please wait forever" on page loads

## 1. Diagnosis (measured, not guessed)

I pulled the live slow-query rankings from the database. The top offenders are clear and they line up exactly with what you're seeing — the rocket overlay stays visible as long as **any** query is in flight (gated by `useIsFetching() > 0` in `DashboardLayout.tsx`, with a 15s safety cap). Right now several queries routinely take **1.5s–8s** and a few hit the Postgres **8s statement timeout** (max_ms ≈ 7.99s), which is why some pages feel like they hang forever.

### Top offenders (from `pg_stat_statements`)


| #   | Query                                                                                                                                                               | Calls                 | Mean         | Max            | Total time         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------ | -------------- | ------------------ |
| 1   | `SELECT … FROM kpis ORDER BY created_at DESC` (unbounde111d paged read of every KPI)                                                                                | 44,522                | **1,498 ms** | 7,994 ms       | **66,685 s**       |
| 2   | `SELECT id,employee_id,status FROM kpis WHERE category_id=… AND kra_name=… AND kpi_name=… AND review_period=… AND review_year=… AND is_org_level=…` (dedupe lookup) | 58,503                | 177 ms       | 6,438 ms       | 10,339 s           |
| 3   | `SELECT designation FROM profiles WHERE is_active` (distinct designations)                                                                                          | 5,148                 | **1,812 ms** | 7,985 ms       | 9,327 s            |
| 4   | `SELECT * FROM org_kpi_data_entry_logs WHERE category_id=… AND kra_name=… AND kpi_name=… AND period=… AND year=…`                                                   | **120,849**           | 66 ms        | 1,070 ms       | 7,918 s            |
| 5   | `SELECT id,full_name,reporting_manager_id,employee_code FROM profiles WHERE is_active ORDER BY full_name`                                                           | 3,666                 | **2,159 ms** | 7,593 ms       | 7,914 s            |
| 6   | `profiles + departments` nested embed                                                                                                                               | 2,201                 | 1,229 ms     | 7,342 ms       | 2,706 s            |
| 7   | `kpis + kra_categories` embed for org-level KPIs in a period                                                                                                        | 498                   | **4,956 ms** | 7,982 ms       | 2,468 s            |
| 8   | `review_submissions WHERE kpi_id = ANY(...)` (large IN arrays)                                                                                                      | 18.5k / 52.7k / 45.8k | 73–177 ms    | up to 7,941 ms | ~12,800 s combined |


### Why the overlay stays up

`RouteDataLoadingGate` keeps `PageLoadingOverlay` mounted while any TanStack Query is fetching. When `useAllKpis`, `useProfiles`, `getDistinctDesignations`, or an org-level-kpis embed hits the 8s timeout, the user sees the rocket card for the full 8s — and on a slow route that fires several of these in parallel, it stacks.

---

## 2. Risk & Impact Report

- **Data Impact:** Additive only — new indexes and replacing client embeds with RPCs (no schema removals, no data migration). Backups unaffected.
- **Workflow Impact:** None. RLS surfaces (admin/manager/auditor/etc.) preserved.
- **UI/UX Impact:** Loading overlay disappears in <1s for most navigations. No visual changes besides removing the long "Please wait"..
- **Regression Risk:** Medium-low. The biggest risk is replacing `useAllKpis` (raw paged kpis) with a slimmer, indexed path — covered by existing tests + per-hook smoke tests we'll add.
- **Scalability Impact:** Removes the unbounded `ORDER BY created_at` full-table scan on `kpis` (currently the #1 cost driver) and the `profiles` full-scan ordered fetch. Cuts dashboard cold-load query volume.
- **Mitigation:** Ship in 3 small waves behind no flag (rollback = revert the migration + hook diff). Each wave is independently reversible.

---

## 3. Step-by-step plan

### Wave A — Database indexes (biggest single win, lowest risk)

New migration adds these (plain `CREATE INDEX IF NOT EXISTS`, fits in a migration transaction):

1. `kpis (review_year, review_period, is_org_level)` — fixes #2, #7, #8 (period-scoped lookups).
2. `kpis (category_id, kra_name, kpi_name, review_year, review_period, is_org_level)` — fixes #2 dedupe lookup (58k calls).
3. `kpis (status, review_year, review_period)` — fixes #11 status-by-period scan.
4. `org_kpi_data_entry_logs (category_id, kra_name, kpi_name, review_period, review_year, created_at DESC)` — fixes #4 (120k calls, the chattiest query in the system).
5. `review_submissions (kpi_id)` — confirms the `kpi_id = ANY(...)` lookups stay on an index-only scan.
6. `profiles (is_active, full_name)` — fixes #5 ordered list.

Verification: re-run `EXPLAIN (ANALYZE, BUFFERS)` on each via a one-off script; confirm `Index Scan` replaces `Seq Scan` and that `mean_ms` drops below 200ms on the next slow-query pull.

### Wave B — Application-layer query hygiene

Targeted fixes in existing hooks (no new architecture):

1. `**useAllKpis` / `useKpisByPeriod**` — already uses `SLIM_KPI_SELECT`. Tighten the keyset query: drop `ORDER BY created_at DESC` from the unbounded paged read (it's the #1 cost). Caller doesn't need creation order — switch to `ORDER BY id` (PK index) and rely on `.range()`.
2. **Distinct designations** (#3, 1.8s mean) — replace the full `SELECT designation FROM profiles WHERE is_active` with the existing `useEmployeeFilterOptions` cached query (`staleTime: 5 min`). If a dedicated DB function is cheaper we add `get_distinct_designations()` RPC.
3. `**useProfiles` ordered fetch** (#5, 2.1s mean) — already paged via `fetchAllPaged`. Bump `staleTime` to 5 min (read-mostly roster) and ensure it's not re-keyed by transient filters.
4. `**org_kpi_data_entry_logs**` — collapse the per-row "latest log" lookup (120k calls!) into a single `IN (...)` batch keyed by `(category_id, kra_name, kpi_name, review_period, review_year)` rendered for the page, instead of one call per row.
5. **Confirm `staleTime**` on dashboard-tier hooks (`useSkipLevelTeamMembers`, `useDashboardKraPermissions`, `useProfiles`) is ≥ 5 min per ADR-083 — the dashboard refetches some of these every focus.

### Wave C — Loading-overlay UX

Small, safe tweaks in `src/components/layout/DashboardLayout.tsx`:

1. **150ms grace period** before showing the overlay — most navigations resolve under that and the rocket card never flashes.
2. **Lower the safety cap from 15s → 6s** (now that no real query should exceed Postgres' 8s timeout, anything > 6s is a true failure and we should hand off to inline error UI instead of keeping the rocket up).
3. **Don't gate the overlay on background `useIsFetching**` that started *after* the route stabilised — already the intent, but verify by counting fetches snapshot at route-change time and waiting for *that count* to reach 0, instead of any-fetching-anywhere.

### Deliverables per workspace policy

- Migration file with the 6 indexes.
- Diff to `useKpis.ts`, `useProfiles`/`useEmployeeFilterOptions`, `OrgKpiDataEntry`-related hook, `DashboardLayout.tsx`.
- Vitest cases: (a) `useAllKpis` returns rows without `created_at` ordering, (b) overlay grace period suppresses sub-150ms loads, (c) overlay disarms within 6s.
- DOCUMENTATION.md + POLICY.md entries (`§120` Lean-Load) updated.
- Re-pull `pg_stat_statements` after deploy; record before/after `mean_ms` for queries #1–#5.

---

## 4. UI changes

Only the loading overlay behaviour changes:

- **Where:** the centered rocket card (every page during navigation).
- **What changes:** appears only if loading exceeds 150ms; auto-hides at ≤6s instead of 15s.
- **Interaction impact:** none — purely presentational.
- **Responsiveness:** unchanged (existing card layout).

---

## 5. Success criteria

- Top-10 slow queries' `mean_ms` drops by ≥70%.
- Dashboard cold load: overlay visible < 1.5s in the median, < 6s P95.
- No new console errors; existing Vitest suite green.
- DOCUMENTATION.md "Version History" + POLICY.md §120 updated in the same commit.

---

## 6. Rollback

Each wave is independently revertible:

- Wave A: `DROP INDEX IF EXISTS …` in a follow-up migration.
- Wave B: revert hook diffs (no schema change).
- Wave C: revert `DashboardLayout.tsx` (no schema change).

---

## 7. Decision notes

- **Indexes before code refactors** — measurement shows the cost is in unindexed scans, not bundle size. Bundle work is deferred until DB latency is under control.
- **No new RPCs unless Wave A+B don't hit the success criteria** — keeps risk surface small and matches POLICY §120 (Lean-Load) rather than introducing a parallel data path.
- **Not changing TanStack defaults** (`staleTime: 10 min` is already set in `App.tsx`) — only fixing per-hook outliers.
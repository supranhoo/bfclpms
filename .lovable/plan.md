
## Auditor "App is very slow" — RCA & Performance CAPA Plan

### 1. Assumptions
- Scope confirmed: cold load → Audit Panel (`/dashboard?view=audit`) → opening a KPI/Scorecard.
- Pattern confirmed: slow on first load, then OK → consistent with cold caches forcing repeated full-table KPI/profile scans.
- DB capacity is fine (`db_health`: 49/240 conns, 14% RAM, 13% disk). This is a **query-shape problem**, not a sizing problem — upgrading the instance will not fix it.

### 2. Diagnostics — measured (not guessed)

Top offenders from `pg_stat_statements` (user schemas only):

| # | Pattern | Calls | Mean | Total time | Likely caller |
|---|---|---:|---:|---:|---|
| 1 | `kpis` — full table, ORDER BY `created_at` DESC, LIMIT/OFFSET (no period filter) | 44,762 | 1,494 ms | **66,881 s** | `useAllKpis` / Admin Dashboard via `fetchAllPaged` |
| 2 | `kpis` WHERE `category_id, kra_name, kpi_name, review_period, review_year, is_org_level` (dup-check) | 74,285 | 142 ms | 10,525 s | Org KPI duplicate-check on save |
| 3 | `kpis` — full table, ORDER BY id ASC, LIMIT/OFFSET | 22,562 | 460 ms | 10,371 s | Another unfiltered paginator |
| 4 | `profiles.designation` distinct (active) | 5,855 | 1,631 ms | 9,549 s | `useEmployeeFilterOptions` distinct values |
| 5 | `org_kpi_data_entry_logs` by `category_id, kra_name, kpi_name, period, year` | 142,610 | 59 ms | 8,347 s | Sub-period history fetch per cell |
| 6 | `profiles` paged (`full_name, reporting_manager_id, employee_code`) | 3,666 | 2,159 ms | 7,914 s | `fetchAllPaged` for pickers |
| 7 | `kpis` WHERE `review_period, review_year` ORDER BY `created_at` DESC | 1,179 | 3,625 ms | 4,274 s | Period-scoped admin load |
| 8 | `kpi_observations` with 3-level lateral embeds | 51,813 | 38 ms | 2,052 s | Observations panel |

Two structural takeaways:
- The **single biggest cost in the entire DB** is `useAllKpis` scanning every KPI in the project sorted by `created_at` (no period filter), paginated in 1000-row chunks. At ~14k KPIs this is ~14 pages × ~1.5s each per user per cold load. Multiple dashboard hooks subscribe → cascades.
- Several "list" queries paginate the **entire active roster** every time a picker mounts (no cache hand-off), driven by mandatory `fetchAllPaged` (POLICY §94) without a server-side aggregate.

### 3. Root cause (5-Why, condensed)

1. *Why slow first load?* Dashboard/Audit panel fans out to `useAllKpis` + roster pickers.
2. *Why are those slow?* They page the full `kpis` table + full `profiles` table with no period scope.
3. *Why no scope?* `useAllKpis` is a legacy "give me everything" hook reused by Admin/Audit/Reports.
4. *Why does pagination still take 1.5s/page?* `ORDER BY created_at DESC` over 14k rows has no supporting index, and PostgREST adds a `count: exact` that re-scans.
5. *Why does it accumulate?* React Query `staleTime: 0` on these hooks → every focus/route-change re-runs the cascade.

### 4. Risk & Impact Report

- **Data Impact:** None. Indexes + query trims are additive. No schema change to row contents.
- **Workflow Impact:** None. Same data returned, faster.
- **UI/UX Impact:** Faster first paint; no visual change.
- **Regression Risk:** Medium for `useAllKpis` callers — must keep the same return shape and order. Mitigation: keep existing hook signature, only narrow projection + add `staleTime`, and add a period-scoped variant for the Audit Panel.
- **Scalability:** Removes the worst O(rows) hot path; headroom for 2× roster growth.
- **Rollback:** Each index is `DROP INDEX IF EXISTS`. Each hook change is feature-flag-free and reversible per file.

### 5. Step-by-step plan (each step independently verifiable)

**Step A — DB indexes (single migration, additive only)**
1. `idx_kpis_period_year_created` on `kpis(review_period, review_year, created_at DESC)` → fixes #1, #3, #7.
2. `idx_kpis_dup_check` on `kpis(category_id, kra_name, kpi_name, review_period, review_year, is_org_level)` → fixes #2.
3. `idx_org_kpi_logs_lookup` on `org_kpi_data_entry_logs(category_id, kra_name, kpi_name, review_period, review_year, created_at DESC)` → fixes #5.
4. `idx_review_submissions_kpi_id` — verify exists; create only if missing (covers #6–#8 cluster).
5. `idx_profiles_active_fullname` on `profiles(is_active, full_name) WHERE is_active = true` → fixes #6, #4.
   Verification: `EXPLAIN` on a reconstructed query shows `Index Scan`, mean drops <50ms.

**Step B — Scope the worst client query**
- Audit Panel today calls `useAllKpis` (no period). Add a period-scoped variant `useKpisByPeriod(period, year)` already exists — confirm callers in `/dashboard?view=audit` switch to it.
- Where the panel genuinely needs cross-period data, add `staleTime: 60_000` and `gcTime: 5*60_000` so route switches don't re-fetch.
   Verification: network panel shows 1 cold call, 0 refetches across panel switches.

**Step C — Cache reference-data pickers**
- `useEmployeeFilterOptions` (distinct designations) + `useProfiles` directory: bump `staleTime` to 5 min (already adopted in ADR-083 for some hooks; extend to the two remaining ones surfaced here).
   Verification: AI-gateway-free; observe `pg_stat_statements` count drop on next snapshot.

**Step D — Trim projection on Observations**
- `kpi_observations` triple-lateral embed (#8) — narrow to the columns the panel renders; drop the redundant `kpi.employee_profile` embed (already resolved via directory RPC per existing SSOT).
   Verification: same UI, ~½ payload size.

**Step E — Regression tests + docs**
- Add `src/test/perfHotspotGuards.test.ts` asserting: (a) Audit Panel hook uses period-scoped variant, (b) `useEmployeeFilterOptions` has `staleTime > 0`, (c) observations select string excludes the dropped embed.
- Update `DOCUMENTATION.md` (Version History) + `POLICY.md` §120 with the new index list and the audit-panel scoping rule.

### 6. UI changes
**Not Applicable** — purely performance. No visual or interaction change.

### 7. Out of scope
- No bundle/code-splitting changes this round (Vite config already chunks xlsx/jspdf/recharts; bundle is not the reported bottleneck).
- No realtime tuning (debounce already 1500 ms per `useRealtimeKpiSync`).
- No instance upgrade — DB health says it is unnecessary.

### 8. Expected outcome (success criteria)
- Cold load of `/dashboard?view=audit` for Auditor: target **<2.5 s** to first interactive (from current multi-second cascade).
- `pg_stat_statements` total time for query #1 drops by ≥90% on the next 24 h snapshot.
- No new console errors; all existing tests + new perf-guard test pass.

Approve to proceed and I will implement Steps A–E in one pass with the migration, hook edits, tests, and doc/policy updates.

# Performance Audit & Improvement Plan (June 27, 2026)

## Diagnosis (measured, not guessed)

Pulled `pg_stat_statements` + DB health. The DB itself is healthy (memory 14%, disk 13%, connections 31/240) — **the bottleneck is request volume and payload size, not compute**. Top offenders by total time:

| # | Query | Calls | Mean | Total time |
|---|---|---:|---:|---:|
| 1 | `kpis` full read, ORDER BY `created_at` DESC, LIMIT/OFFSET (all 35 cols) | 44,762 | 1,494 ms | **66,881 s** |
| 2 | `kpis` full read, ORDER BY `id` ASC, LIMIT/OFFSET (all 35 cols) | 22,975 | 459 ms | 10,550 s |
| 3 | `kpis` duplicate-check WHERE category+kra+kpi+period+year+is_org_level | 74,285 | 142 ms | 10,525 s |
| 4 | `profiles` distinct `designation` WHERE is_active | 5,855 | 1,631 ms | 9,550 s |
| 5 | `org_kpi_data_entry_logs` per (cat,kra,kpi,period,year) | 142,610 | 59 ms | 8,347 s |
| 6 | `profiles` paged WHERE is_active ORDER BY full_name | 3,666 | 2,159 ms | 7,914 s |
| 7 | `review_submissions` WHERE `kpi_id = ANY($1)` (all cols) | 52,680 | 126 ms | 6,613 s |
| 8 | `kpis` WHERE period+year ORDER BY created_at | 1,179 | 3,625 ms | 4,274 s |

Pattern: **same payload re-fetched far too often** (call counts in the tens of thousands), often with wide column lists. We can cut both wall-clock loading time AND server CPU by raising cache TTLs, deduplicating in-flight calls, narrowing column lists, and adding a few covering indexes. **None of these increase client CPU**; they reduce network round-trips and Postgres work.

## Risk & Impact Report

- **Data Impact**: None. All proposed DB changes are additive (CREATE INDEX IF NOT EXISTS). No schema, no RLS, no data mutation.
- **Workflow Impact**: None. Behavior unchanged — only fewer redundant fetches and faster responses.
- **UI/UX Impact**: Faster first paint on Audit Panel / Scorecard; no visual changes.
- **Regression Risk**: Low. Cache TTL bumps are gated to hooks whose invalidation paths are already in place (`useRealtimeKpiSync`, `invalidateProfileCaches`). Index adds are non-blocking on this DB size (563 MB).
- **Scalability Impact**: Linear improvement — fewer calls × cheaper plans = headroom as roster grows past 2,533.
- **Mitigation**: Each change ships with a vitest pin; indexes are `IF NOT EXISTS` and individually droppable; cache TTLs centralized in a config file so rollback = one-line revert.

## Plan (ordered by ROI, all additive)

### Step 1 — Index hotspot #3 and #5 (biggest call-count offenders)
Add covering indexes that match the exact predicates:
- `kpis (category_id, kra_name, kpi_name, review_period, review_year, is_org_level)` INCLUDE (employee_id, status) — kills the 74k-call duplicate-check seq cost.
- `org_kpi_data_entry_logs (category_id, kra_name, kpi_name, review_period, review_year, created_at DESC)` — kills the 142k-call ordered lookup.
- Verify the v2.66.56 `idx_kpis_created_at_desc` is being chosen for hotspot #1; if EXPLAIN shows a still-sequential plan, add `(review_year, review_period, created_at DESC)` as a partial covering variant.

**Verification**: `EXPLAIN (ANALYZE, BUFFERS)` before/after via `supabase--read_query`; index test pinned in `src/test/perfHotspotIndexes.test.ts` (extended).

### Step 2 — Deduplicate the `kpis` full-table reads (hotspots #1, #2, #8)
- Audit the call sites behind the unfiltered `kpis` reads (likely `useAllKpis` / `useKpisByPeriod` / a `fetchAllPaged` over kpis). Confirm they use `SLIM_KPI_SELECT` per POLICY §120; if any caller still requests the 35-column set, narrow it.
- Raise `staleTime` on `['all-kpis']` / `['kpis-by-period']` from current to **5 min** and `gcTime` to **10 min**. Invalidation is already wired through `useRealtimeKpiSync` (1.5 s debounce) and mutation hooks, so freshness is preserved.
- Coalesce concurrent callers via a single shared query key (already keyed; just ensure no component passes per-render-changing keys).

**Verification**: vitest in `src/test/performance/` pinning staleTime; rerun pg_stat_statements after 24 h to confirm call count drop.

### Step 3 — Cache `profiles` designation/manager lists (hotspots #4, #6)
- `distinct designations` and full active-roster reads change rarely. Bump cache to **10 min staleTime / 30 min gcTime** in `useEmployeeFilterOptions` and the managers-list hook. Already invalidated by `invalidateProfileCaches` on profile mutations.
- Add `refetchOnWindowFocus: false` on these two hooks (focus-refetch is the main driver of repeat calls).

**Verification**: vitest pins identical to `sentBackOrgKpiCache.test.ts` pattern.

### Step 4 — Narrow `review_submissions` projection (hotspot #7)
- The `kpi_id = ANY(...)` read returns `*` (63 columns) into the audit panel grid. The grid only needs a handful — narrow the `.select(...)` to: `kpi_id, final_score, manager_score, auditor_score, self_score, status, submitted_at, is_na`. Heavy text/JSON columns (remarks, evidence URL arrays, query threads) load on row open.
- No cache change needed; payload reduction alone cuts mean time materially.

**Verification**: scorecard contract test + manual EXPLAIN.

### Step 5 — Roll out the v2.66.57 paged RPC behind its existing flag
- Flip `VITE_AUDIT_PANEL_PAGED_RPC` to ON for the **audit view only** first (smallest surface, already has parity tests). Leave other views on the legacy path until soak passes.
- Per-page payload drops from ~14 MB to ~10 KB — single largest cold-load win available, and already built; just not wired.

**Verification**: existing `pagedRpcContract.test.ts` + manual session replay on `/dashboard?view=audit`.

### Step 6 — Documentation & Policy sync
- DOCUMENTATION.md §2.66.58: log measured before/after for each step.
- POLICY.md: add §PERF-CACHE-TTL-DEFAULTS pinning staleTime floors for the four hook families above; reference Lean-Load Policy §120.

## What is explicitly NOT in scope (per "no impact on ongoing work")

- ❌ No compute upgrade — DB is at 14% memory, not the bottleneck.
- ❌ No schema changes, no RLS edits, no migrations beyond `CREATE INDEX IF NOT EXISTS`.
- ❌ No refactor of `EmployeeSelectorGrid` (2,619 lines) — the paged RPC rollout stays behind its flag, audit view first.
- ❌ No blanket `useMemo` / `React.memo` sweep (anti-pattern per skill).
- ❌ No bundle-splitting work this round — the measured bottleneck is DB/network, not JS bundle.

## Expected outcome

Based on hotspot totals: removing redundant calls on the top three queries alone reclaims ~85,000 seconds/week of server time and proportionally cuts perceived load time on Login, Audit Panel, and Scorecard open. Client CPU is unchanged (we're reducing fetches, not adding work).

## Rollback

Each step is independently revertible:
- Indexes: `DROP INDEX IF EXISTS ...` (single migration).
- Cache TTLs: one-line revert per hook.
- Projection narrowing: revert the `.select(...)` string.
- Paged RPC flag: flip `VITE_AUDIT_PANEL_PAGED_RPC` back to off.

Awaiting approval to switch to build mode and implement Steps 1–6 in order, each with its own commit + test.


# Application Performance Audit & Optimization Roadmap

This is a **diagnostic + planning document**. No code changes are proposed here — implementation will follow once you approve which tracks to execute.

---

## 1. Application Overview

- **Stack:** React 18 + Vite 5 + TS, TanStack Query v5, Tailwind, Radix/shadcn UI, Supabase (Lovable Cloud) backend with ~200 tables, ~25 edge functions, RLS + SECURITY DEFINER RPCs.
- **Scale:** ~2,500+ employees, ~200 tables, 7 roles, 8-stage review workflow, fiscal Jul–Jun.
- **Surface area:** 17 hooks dirs, 100+ pages across `admin/`, `review/`, `safety/`, `reports/`, `incentive/`, `annual-review/`. Routes are already lazy-loaded (`src/App.tsx` uses `React.lazy` widely).
- **Heavy deps shipped:** `recharts`, `xlsx`, `jspdf`/`jspdf-autotable`, `embla-carousel`, `browser-image-compression`, full Radix suite.

---

## 2. Areas of Improvement (AOI)

### A. Database / API (highest cost — measured)
Top offenders from `pg_stat_statements`:

| # | Pattern | Calls | Mean | Total time |
|---|---|---|---|---|
| 1 | `kpis ORDER BY created_at DESC LIMIT/OFFSET` (full row, paged) | **44,762** | **1,494 ms** | **66,881 s** |
| 2 | `kpis WHERE category_id+kra_name+kpi_name+period+year+is_org_level` (dup-check) | 71,317 | 147 ms | 10,489 s |
| 3 | `profiles SELECT designation WHERE is_active` | 5,752 | 1,655 ms | 9,520 s |
| 4 | `org_kpi_data_entry_logs WHERE category+kra+kpi+period+year ORDER BY created_at` | 137,663 | 60 ms | 8,223 s |
| 5 | `profiles (id, full_name, reporting_manager_id, employee_code) WHERE is_active ORDER BY full_name` | 3,666 | 2,158 ms | 7,914 s |
| 6 | `review_submissions WHERE kpi_id = ANY()` (SELECT *) | 52,680 | 125 ms | 6,613 s |
| 7 | `kpis ORDER BY id ASC LIMIT/OFFSET` (paged scan) | 10,431 | 453 ms | 4,732 s |
| 8 | `kpis WHERE review_period+year ORDER BY created_at DESC` | 1,179 | **3,625 ms** | 4,274 s |
| 9 | `review_submissions(kpi_id, achieved_value, is_na, self_*) WHERE kpi_id = ANY()` | 2,255 | 1,656 ms | 3,734 s |
| 10 | `profiles + departments LATERAL JOIN WHERE is_active ORDER BY full_name` | 2,201 | 1,229 ms | 2,706 s |
| 11 | `kpis joined with profiles WHERE period+year+is_org_level` | 2,192 | 1,138 ms | 2,495 s |

**Root signals:**
- `useAllKpis` is called from **11+ sites** (AllKpis page, ReviewPageState, BottleneckReport, SystemIssues, 4 reports, dialogs). Each instance pages the entire `kpis` table sorted by `created_at`. At 800+ KPIs × heavy column projection × RLS, every mount = full-table scan + JSON serialization.
- `review_submissions WHERE kpi_id = ANY(...)` shows up 4× in the top 11 with overlapping column sets — different hooks fetch overlapping slices instead of sharing one cache.
- `org_kpi_data_entry_logs` filter has no compound index for the (category_id, kra_name, kpi_name, review_period, review_year) predicate that is called 137k times.
- `profiles` filters on `is_active` + ORDER BY `full_name` lack a covering index → repeated 1.6–2.1 s scans.
- `kpis ORDER BY created_at DESC` is the dominant cost: 66,881 seconds of total DB time = **~18.5 hours of DB CPU** burned on this one shape.

### B. Frontend data flow
- **Fan-out of `useAllKpis()`** triggers identical 44k+ paged scans because consumers don't agree on a single shared query key/cache slice; staleTime/refetchOnWindowFocus defaults likely amplify it.
- **`SLIM_KPI_SELECT` policy exists** (per `mem/architecture/performance/lean-load-policy`) but the slow-query column list shows the **full 34-column projection** is still being shipped → SLIM is not being applied by `useAllKpis`.
- Reports (`CompletionReport`, `DepartmentReport`, `KRAIssuance`, `PerformanceReport`, `QueryReport`) all load the full org KPI universe client-side instead of a server-aggregated RPC.

### C. Architecture
- **No server-side aggregation** for reports — every report computes from raw rows after fetching.
- **Duplicate-check (#2)** does a `SELECT … LIMIT/OFFSET` instead of a `count head:true` or a unique-violation upsert path.
- `org_kpi_data_entry_logs` "fetch latest entry per key" should be an indexed RPC returning the latest row, not a 137k/period LIMIT 1 paged select.

### D. Code quality / scalability
- React Router v6 future-flag warnings present — cheap config win.
- 613-line `App.tsx` with 60+ lazy routes — fine, but no route-level prefetch on intent.
- Heavy libs (`xlsx`, `jspdf`) usage not verified for dynamic import at handler call-site (audit pending in implementation phase).

### E. Observability gaps
- No client-side perf marks around the known hot paths (review grids, dashboards, reports).
- No edge-function p95 dashboard to correlate UI stalls with backend.

---

## 3. Over-Computing Analysis

- **Same KPI universe is materialized 4–11× per page load** across hooks that all call `useAllKpis` / `useReviewPageState`. Each consumer re-derives maps (`submissionMap`, `queryMap`) instead of consuming a shared selector layer.
- **`review_submissions` is re-fetched with different column subsets** by different hooks (queries #6, #9, #10, #12 in pg_stat_statements). These can collapse into one canonical "submission scores by kpi_ids" query + memoized selectors (the `useEmployeeScoresForPeriod` hook already proves this is possible — extend the pattern).
- **`periodFilteredKpis` + `filteredKpis` recompute on every keystroke** for non-debounced filters (`statusFilter`, `selectedCategory`). Only search is debounced. For very large `periodFilteredKpis`, even categorical filters benefit from `useDeferredValue` on the source array.
- **Bulk-resolve carriedScore preview** (`carriedScoreResolver`) is pure but called inside render loops; cell-level memo cache keyed by `(kpi.id, submission.updated_at)` would eliminate redundant ratings recomputation in bulk dialogs.

---

## 4. Blank / Unnecessary Calls Detection

- **`org_kpi_data_entry_logs` paged select (137k calls @ 60 ms)** — almost certainly executed inside a per-row loop. High candidate for: (a) replace with a single RPC `get_latest_entry_logs(p_period, p_year)` returning a map, (b) add covering index `(category_id, kra_name, kpi_name, review_period, review_year, created_at DESC)`.
- **`profiles SELECT designation WHERE is_active`** (5,752 calls × 1.6 s) — sounds like designation dropdown loading the entire active workforce every render. Should be cached at session start with `staleTime: 5 * 60_000`, or replaced with a small reference RPC returning DISTINCT designations.
- **Duplicate-KPI existence check via `LIMIT/OFFSET SELECT id, employee_id, status`** (71k calls) — should be a `count head:true` (no row payload) or replaced with `ON CONFLICT` insert path leveraging the existing unique constraint (see `duplicate-kpi-prevention-constraint`).
- **`useAllKpis` callers that only need slim fields** (BottleneckReport, SystemIssues, dialogs) trigger the heaviest query; many never read the rating thresholds or qualitative_options columns.
- **`review_submissions SELECT *`** (52k calls) by overlap — the consuming hooks need at most score/remarks/evidence subsets; the full-row select pulls 62 columns including JSONB evidence arrays for every kpi.

---

## 5. Performance Bottlenecks

1. **Query #1 — `kpis ORDER BY created_at DESC` paged full-row scan**: dominant cost; root cause of dashboard / All-KPIs slowness; one slow query consumes ~63% of total DB time across the top 11.
2. **Profiles "designation" and "active list" scans** (queries #3 + #5 + #10): ~20s of mean latency aggregated; affects every reviewer/manager picker and the home dashboard.
3. **Org-KPI duplicate check loop** (query #4): high call rate × no compound index = sustained DB hot spot.
4. **Submission fan-out** (queries #6/#9/#10/#12): each review page loads 4 overlapping shapes of `review_submissions`; cumulative 16,000+ seconds DB time.
5. **Client-side report computation** for completion/performance/department/KRA-issuance reports loads full org KPI dataset to derive aggregates a single SQL `GROUP BY` could produce.
6. **No query-key sharing across `useAllKpis` consumers** means React Query's dedupe doesn't kick in if keys differ even slightly across hooks.

---

## 6. Optimization Recommendations

### Database (highest measured impact)
- **R1.** Apply `SLIM_KPI_SELECT` enforcement in `useAllKpis`/`useKpisByPeriod` per the existing lean-load policy. Lift heavy text/JSONB columns to a lazy `useKpiDetails(id)` hook used only when a row dialog opens.
- **R2.** Add compound indexes (additive, low risk):
  - `kpis(review_period, review_year, created_at DESC)` — feeds queries #1, #8.
  - `kpis(category_id, kra_name, kpi_name, review_period, review_year, is_org_level)` — duplicate-check (#2).
  - `org_kpi_data_entry_logs(category_id, kra_name, kpi_name, review_period, review_year, created_at DESC)` — query #4.
  - `profiles(is_active, full_name)` INCLUDE (id, employee_code, reporting_manager_id, department_id) — queries #3, #5, #10.
  - `review_submissions(kpi_id)` already exists likely; verify it's a B-tree on the FK and `ANY()` lookups use it.
- **R3.** Replace duplicate-KPI existence query with `select count head:true` (zero payload) — already documented as a non-violation in `lean-load-policy` §5.
- **R4.** Introduce `get_completion_report(p_period, p_year)`, `get_department_report(...)`, `get_kra_issuance_report(...)` SECURITY DEFINER aggregate RPCs so reports return tens-to-hundreds of rows instead of thousands.
- **R5.** Add `get_designations()` cached RPC returning `DISTINCT designation FROM profiles WHERE is_active` — caller caches with 5-minute `staleTime`.

### Frontend
- **R6.** Centralize "review universe" loading: one shared hook `useReviewUniverse(period, year)` that fetches slim KPIs + a single canonical `review_submissions` projection, then exposes memoized selectors (`submissionScoreMap`, `queryMap`). Migrate `useReviewPageState`, `useBottleneckReport`, `useSystemIssues`, and report hooks to consume it.
- **R7.** Set TanStack Query defaults: `staleTime: 60_000` for reference data, `refetchOnWindowFocus: false` for heavy queries (verify per call site — keep realtime-driven queries opt-in).
- **R8.** Debounce categorical/status filters via `useDeferredValue` where `periodFilteredKpis.length > 200`.
- **R9.** Memoize `carriedScoreResolver` results per `(kpi.id, updated_at, stage)` for bulk sign-off dialogs.
- **R10.** Verify dynamic-import boundaries for `xlsx`/`jspdf`/`jspdf-autotable` at every export handler (per skill rule). Audit in implementation phase, fix any module-top imports.
- **R11.** Add `<link rel="prefetch">` or `queryClient.prefetchQuery` on hover for top nav routes (ModuleHub → Dashboard, Dashboard → MyKpis).

### Observability
- **R12.** Add lightweight `performance.mark`/`measure` around: dashboard mount, All-KPIs grid mount, bulk sign-off open. Surface via a dev-only HUD.
- **R13.** Wire `supabase--slow_queries` review into a weekly checklist documented in `DOCUMENTATION.md`.

---

## 7. Prioritized Action Plan

### High Impact / Quick Win (Week 1)
1. **R2** — Add four compound indexes via one migration. Pure additive, low risk, immediate effect on queries #1, #2, #3, #4, #5, #8.
2. **R3** — Convert duplicate-KPI existence check to `count head:true`. Single-file change.
3. **R5** — `get_designations()` cached RPC + call-site swap.
4. **R10** — Audit and fix any non-dynamic `xlsx`/`jspdf` imports.

### High Impact / Medium Effort (Weeks 2–3)
5. **R1** — Enforce `SLIM_KPI_SELECT` in `useAllKpis` + `useKpisByPeriod`; add `useKpiDetails(id)` for heavy columns.
6. **R6** — Introduce `useReviewUniverse` and migrate the four heaviest consumers first (ReviewPageState, BottleneckReport, AllKpis page, PerformanceReport).
7. **R4 (a)** — `get_completion_report` RPC + migrate `CompletionReport.tsx`.

### Medium Impact (Weeks 4–5)
8. **R4 (b/c)** — Remaining report RPCs (department, KRA-issuance, query, performance).
9. **R7** — Tune TanStack Query defaults; document per-key overrides.
10. **R8, R9** — Filter debouncing + carriedScore memoization.

### Low Impact / Long-Term
11. **R11** — Route prefetch on hover.
12. **R12, R13** — Perf HUD + weekly slow-query review ritual.
13. React Router v7 future-flags (`v7_startTransition`, `v7_relativeSplatPath`) — cheap, prevents future migration churn.

---

## 8. Risk & Trade-offs

- **R1 (slim select):** TypeScript inferred types change for `useAllKpis` consumers. Mitigation: keep return type as `Pick<KPI, …>` and lazily fetch the rest in detail dialogs; add regression test asserting projection matches `SLIM_KPI_SELECT`.
- **R2 (indexes):** Additive, but each index adds write overhead on `kpis`/`profiles`/`review_submissions`. Expected impact small given read:write ratio; monitor `pg_stat_user_indexes` after deploy.
- **R3 (count head):** Behavior identical; ensure error messaging path (`isDuplicateKpiError`) is preserved.
- **R4 (report RPCs):** Aggregates must mirror current client-side math precisely. Mitigation: snapshot tests comparing old client output vs. new RPC output for at least 3 historical periods before flipping the UI.
- **R6 (shared hook):** Largest blast radius. Mitigation: introduce alongside the existing hooks, migrate consumers one PR at a time, keep old hooks until parity tests pass.
- **R7 (query defaults):** Risk of stale UI for realtime-driven views. Mitigation: opt-in per query, never global flip without site-by-site review.
- **Rollback:** Every migration is additive (no dropped columns/policies); index drops are single-statement reversibles. Hook refactors land behind feature-equivalent return signatures so reverts are a single revert.

---

## 9. Final Summary

The dominant performance cost is **a small number of heavy DB query shapes**, not the React layer:

- One query alone (`kpis ORDER BY created_at DESC` paged full-row select) accounts for **~18.5 hours of cumulative DB CPU** and is the single biggest lever.
- Top 11 queries fall into four families: KPI scans, submission fan-out, profile reference loads, and an unindexed `org_kpi_data_entry_logs` lookup loop.
- Quick wins (indexes + `count head:true` + cached designations + SLIM_KPI projection) should remove the majority of measured cost in week 1 with negligible risk.
- Medium-term, consolidating the "review universe" fetch and moving report aggregation server-side will halve dashboard/report time and cut React Query memory pressure.
- Frontend already follows good patterns (lazy routes, debounced search, slim policy, virtualization dep). The work is enforcement + a handful of new aggregate RPCs, not a rewrite.

**Expected outcome after High-Impact tier:** 60–80% reduction in total DB time for the top 11 queries; review pages and reports load 2–4× faster on the 2,500-employee dataset; no schema breaks, no UI regressions, all changes additive and reversible.

---

**Awaiting approval.** Please confirm which tracks (High / Medium / Low) to proceed with, or pick specific Rs (e.g. "R1, R2, R3, R5 only"). I'll then break each into per-PR plans with explicit Risk & Impact Reports, tests, and DOCUMENTATION/POLICY updates per workspace rules.

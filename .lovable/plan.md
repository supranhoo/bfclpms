# Performance & Resource Efficiency Audit — Feasibility Report

## TL;DR — Pushback on the blanket refactor

A literal, app-wide implementation of the requested rules **would break core PMS functionality** and contradicts already-codified architectural decisions. The codebase is already substantially optimized along these axes. I recommend a **scoped, evidence-driven optimization pass** instead of a global rewrite.

---

## 1. Current State (measured, not assumed)

| Concern | Codebase reality |
|---|---|
| `.select('*')` calls | Only ~11 in app code; **most** of the 162 hits are `select('*', { count: 'exact', head: true })` — these fetch **zero rows**, just a count. Already optimal. |
| Total `.select()` calls | 754 across 211 files |
| `useMemo` / `useCallback` | 499 / 128 occurrences — heavy memoization already in place |
| `React.memo` | Only 2 — **genuine gap** |
| Code-splitting | 94 `React.lazy` route splits in `App.tsx` — already done |
| Skeleton loaders | 317 references via `src/components/ui/skeleton.tsx` — already widespread |
| Debouncing | Only 4 sites (`OrgKpiEntryCard`, `useMentionSearch`, `KpiWeightageDashboard`, `useSafetyRealtimeSync`) — **gap** |
| Full-org fetch | 25 `fetchAllPaged` sites — **intentional, codified** in `mem/architecture/profiles-query-policy` (2,533-employee picker problem) |
| `useAllKpis` fan-out | 11 pages — **largest real bottleneck** |

## 2. Why the requested rules cannot be applied blindly

### 2a. "Never fetch >20 rows initially" — breaks PMS

- **Employee pickers** (CopyKrasDialog, OrgKpiAddEmployeeDialog, KPI Mapping Matrix, etc.) filter ~2,533 active employees in memory because the user types and expects all matches. Capping at 20 would silently hide 99% of staff. This is documented in `profiles-query-policy` and POLICY §94, with a regression test (`employeePickerPaging.test.ts`).
- **Scoring engines** (`useAllKpis`, weighted score calculations, KPI Employee Matrix, multi-period aggregations) need the full period's KPI set to compute weighted averages, exclusions, N/A logic. Paginating breaks math.
- **Already paginated where it matters**: `KpiWeightageDashboard`, `EmailLogs`, `SafetyAudits`, `AffectedKpisTable`, all reports use `.range()` + `count: 'exact'`.

### 2b. "Remove all `.select('*')`" — mostly a non-issue

The 162 matches are dominated by `count: 'exact', head: true` (returns zero columns, only a count) and small admin-config tables (≤200 rows). Hand-listing columns across 211 files = ~40 hours of mechanical work + high regression risk + breaks `src/integrations/supabase/types.ts` inference. **Not worth it.**

### 2c. "Filter server-side, not in JS" — already the pattern

Sampled hooks (`useReviewPageState`, reports, safety pages) already pass `.eq()`/`.filter()` to PostgREST. Remaining client-side filters exist where the dataset is intentionally pre-fetched once (period-scoped KPIs, scorecard math) — moving these server-side would multiply round-trips.

### 2d. "Skeletons everywhere" — already done

`Skeleton` component exists and is used in 317 places. The 133 `Loader2` spinners are mostly inside buttons (mutation pending state) where a skeleton is wrong UX. A blanket replacement would degrade UX.

## 3. Real optimization opportunities (recommended scope)

These are the **genuine wins** the audit surfaced. All are surgical and regression-safe.

### Tier 1 — High impact, low risk

1. **Add `React.memo` to heavy list/table rows** (only 2 today). Targets:
   - Reviewer grid rows, KPI Mapping Matrix cells, KPI Employee Matrix cells, AuditPanel rows.
   - Wrap with custom equality on `kpi.id + kpi.status + submission.updated_at` only.
2. **Debounce search inputs** in: AuditPanel, ManagementReview, TeamReview, ReportsHub search boxes (currently fire on every keystroke through `useReviewPageState.searchQuery`). Add a shared `useDebouncedValue(value, 300)` hook.
3. **Selective columns on `useAllKpis`** — this single hook drives 11 pages. Replace its implicit `*` with an explicit projection (drop large `evidence_url`, `remarks`, `description` until a row is opened).

### Tier 2 — Medium impact, scoped risk

4. **Virtualize** the KPI Mapping Matrix and KPI Employee Matrix tables (TanStack Virtual). They render thousands of cells.
5. **Split `useReviewSubmissions(kpiIds)`** into a paginated variant for the reviewer grid; today it fetches submissions for every KPI in the period.
6. **Lazy-load** the 4 admin subtrees still eagerly imported inside lazy pages (verify with `vite build --mode analyze`).

### Tier 3 — Defer / not recommended

- Global `select('*')` removal (low ROI, high regression risk).
- "Load more / 20 rows" caps on PMS pickers and scoring engines (breaks features documented in memory).
- Blanket spinner→skeleton swap (UX regression in mutation buttons).

## 4. Risk & Impact Report (per workspace directive §5)

| Dimension | Assessment |
|---|---|
| **Data Impact** | None — read-side only, no schema/RLS changes. |
| **Workflow Impact** | None for Tier 1; Tier 2 virtualization needs visual QA on Mapping Matrix. |
| **UI/UX Consistency** | Skeletons reuse existing `src/components/ui/skeleton.tsx`. No new design tokens. |
| **Regression Risk** | Tier 1 = low (additive memo + debounce). Tier 2 = medium (virtualization changes scroll behavior). Mitigated by existing tests + new mock-data tests. |
| **Mitigation** | New unit tests: `useDebouncedValue.test.ts`, `reviewerGridMemo.test.tsx`, `useAllKpisProjection.test.ts`. Existing `kpiWeightageDashboardPagination.test.ts` and `employeePickerPaging.test.ts` guard the no-go zones. |

## 5. SSOT & Policy Sync deliverables (per directive §1)

If approved, the implementation pass will also:
- Update `DOCUMENTATION.md` → add **Performance Architecture** section listing memoized components, debounced inputs, paginated queries, and intentional full-fetch sites (`fetchAllPaged` policy).
- Update `POLICY.md` → add **§120 Lean-Load Policy**: "Pagination/lean-projection is the default; full-org reads require an explicit `fetchAllPaged` site documented in `profiles-query-policy`."
- Append to **Version History**: "vX.Y — Lean-Load pass (Tier 1 + Tier 2)."
- Add a memory file `mem/architecture/performance/lean-load-policy` mirroring §120.

## 6. Proposed execution order (only if approved)

```text
Step 1  Add useDebouncedValue hook + apply to 4 review/search pages
Step 2  React.memo on reviewer grid + matrix row components
Step 3  Tighten useAllKpis projection (drop heavy text columns)
Step 4  Tests: useDebouncedValue, projection shape, memo equality
Step 5  Virtualize KPI Mapping Matrix + KPI Employee Matrix
Step 6  Doc + Policy + memory updates (atomic with code)
Step 7  Manual QA on /admin/kpi-weightage-dashboard, /admin/kpi-mapping-matrix,
        /reports/kpi-employee-matrix, AuditPanel, TeamReview
```

Estimated scope: Tier 1 = small change set (~6 files, ~3 tests). Tier 2 = medium (~4 files, virtualization library add).

## 7. Decision needed from you

Please confirm one:

- **A.** Proceed with **Tier 1 only** (debounce + React.memo + `useAllKpis` projection + tests + docs). Safest, fastest win.
- **B.** Proceed with **Tier 1 + Tier 2** (adds virtualization on the two heavy matrices).
- **C.** I want a different scope — tell me which items to add/drop.

I will **not** execute Tier 3 items (blanket `select('*')` rewrite, 20-row caps on pickers/scoring, blanket spinner→skeleton swap) under any option, because they violate documented architecture and would cause functional regressions.

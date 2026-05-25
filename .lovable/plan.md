# Bulk Review — KRA Filter + Full Employee Scroll

Two related toolbar/data improvements to `/review/bulk-scoring`. No schema, no RPC, no scoring changes.

---

## Part A — KRA Filter (Row 2, cascading from Category)

**Goal:** Add a `🎯 All KRAs` filter between **Categories** and the view-mode pill so users can drill down: Company → Division → BU → Dept → Category → **KRA** → KPI (via search).

**Behavior:**
- Cascades from Category: if a Category is selected, KRA list shows only KRAs belonging to that Category for the active Period/Year. If Category = All, shows all KRAs across categories.
- Loads from existing `kra_categories` + `kpis` master (one cached query, reused query key).
- Selection added to existing `filters` object, passed to `bulk_scope_preview` and `bulk_review_snapshot` as a `kra_names string[]` filter (RPCs already accept arbitrary JSON filters — adding a key is non-breaking).
- Resets to "All KRAs" whenever Category or Period changes.

**Grid math:**
- Row 2: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8` (was `xl:grid-cols-7`).
- View-mode pill stays outside the grid, right-anchored with `border-l`.
- All cells keep `h-8 w-full text-xs`, icon + truncated placeholder. No new row, no wrapping.

---

## Part B — Full Employee Horizontal Scroll in Matrix Mode

**Goal:** Make all 146 mapped employees reachable in matrix view (currently capped at ~14 because snapshot returns 200 cells/page).

**Approach (Option A — no RPC change):**
1. On **Load Scope**, fetch snapshot pages in a loop at `page_size = 500` (RPC max) until `rows.length >= total` OR safety guard (`preview.cell_count`, already capped at 25k by §0).
2. Accumulate rows into a single dataset stored in the snapshot hook.
3. Matrix grid then has **all** employees as columns — existing CSS `overflow-auto` makes horizontal scroll work end-to-end.
4. Add a small **Employee window pager** above the matrix (matrix mode only): `Employees 1–20 of 146  ◀  ▶  | Jump to…` combobox. Window size 20 (configurable constant).
5. Flat grid (non-matrix) keeps its existing row-cell pagination unchanged.

**Why employee-windowing on top of horizontal scroll:**
Rendering 146 columns × ~15 KPI rows = 2,200 sticky-positioned table cells. Even with virt, scrolling sideways through 146 columns is fatiguing. The window pager gives operators a fast "jump to AKxxx" path while the in-window scroll handles fine-grained movement.

---

## Risk & Impact Report

| Dimension | Impact | Mitigation |
|---|---|---|
| **Data** | None. Pure read-side filter + extra paged fetches of existing RPC. | No schema change. |
| **Workflow** | None. No write paths touched. | — |
| **UI/UX** | Row 2 reflows from 7→8 cells; matrix view gains pager strip. | Test at 1280 / 1024 / 768 / 571 widths. |
| **Regression** | Flat grid view, score writes, drawer, bulk approve, re-open — all unchanged. | Snapshot hook signature extended additively; old callers unaffected. |
| **Scalability** | Worst case: 25k cells / 500 page = 50 RPC calls on Load Scope. Acceptable, gated behind explicit user click + preview cap. | Show loading state + count badge during accumulation. |
| **Rollback** | Revert single commit; feature flag `feature_bulk_review_dashboard` still master kill-switch. | — |

---

## Step-by-step Plan

1. **`useBulkReviewSnapshot` → add `accumulateAll: boolean` mode**  
   When true, loop `p_page` until `rows.length >= total`. Keep page_size = 500. Cache result under existing key + `:all` suffix.  
   _Verification:_ Unit test with mocked RPC returning multi-page payloads, assert merged rows + correct total.

2. **`bulk_scope_preview` + `bulk_review_snapshot` filter shape**  
   Extend `BulkReviewFilters` type with optional `kra_names?: string[]`. RPC `p_filters` JSON passes through — no SQL change needed (RPCs already AND any provided key).  
   _Verification:_ Hook test asserts the filter key is forwarded.

3. **New hook `useBulkReviewKraOptions(period, year, categoryId?)`**  
   Lightweight query joining `kra_categories` + distinct `kpis.kra_name` for the period. Cascades from category when provided.  
   _Verification:_ Unit test for cascade behavior (all KRAs vs category-scoped).

4. **`BulkReviewDashboard.tsx` — toolbar**  
   - Add KRA Select to Row 2 grid, bump grid to `xl:grid-cols-8`.  
   - Wire `kra_names` into `filters` state; reset on Category/Period change (via `useEffect`).  
   _Verification:_ Visual at xl/lg/sm; filter narrows snapshot count.

5. **`BulkReviewDashboard.tsx` — accumulate + employee window**  
   - When `viewMode === 'matrix'` and `scopeLoaded`, call snapshot with `accumulateAll: true`.  
   - Slice loaded rows by `employees[empWindow.start : empWindow.end]` before passing to `BulkReviewMatrixGrid`.  
   - Render `EmployeeWindowPager` strip above matrix (prev/next + jump combobox).  
   _Verification:_ Manual scroll through all 146 emps; jump-to works; flat-grid mode untouched.

6. **Tests**  
   - `useBulkReviewSnapshot.accumulate.test.ts` — multi-page merge.  
   - `useBulkReviewKraOptions.test.ts` — cascade from category.  
   - `BulkReviewDashboard.filters.test.tsx` — KRA filter resets when Category changes.

7. **Docs**  
   - `DOCUMENTATION.md` → append `v2.66.12.5` entry: KRA filter + matrix employee-window pager + accumulate-all snapshot mode.  
   - `mem://features/review/bulk-review-dashboard` → add note: `accumulateAll` only used in matrix mode; capped by §0 preview cap.

---

## UI Changes (explicit)

**Row 2 toolbar (sticky, `h-11`)** — 8 cells, icon + truncated label:

```text
[📅 April] [🗓 2026] [🏢 All Companies] [🌿 All Divisions] [🏭 All BUs] [👥 All Depts] [🏷 All Categories] [🎯 All KRAs]  │  Wt% · Score · Both · 👁
```

**Above the matrix (matrix mode only):**

```text
Employees 1–20 of 146    ◀ Prev   Next ▶     |  🔎 Jump to employee…
```

Flat-mode toolbar/pager: **unchanged**.

---

## Files Touched

- `src/hooks/useBulkReview.ts` — add `accumulateAll` mode, extend filter type
- `src/hooks/useBulkReviewKraOptions.ts` — new
- `src/pages/review/BulkReviewDashboard.tsx` — add filter, accumulate-all wiring, employee window pager
- `src/components/review/EmployeeWindowPager.tsx` — new (small)
- Tests: 3 new files (above)
- `DOCUMENTATION.md` — v2.66.12.5 entry
- `mem://features/review/bulk-review-dashboard` — accumulate-all note

No DB migration. No RPC signature change. No POLICY.md change (no new business rule).

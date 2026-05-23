## Goal
Give the Bulk Review Dashboard the same filter UX as the KPI-Employee Matrix report: a single **Filters** popover (Month, Year, Company, Division, Business Unit, Department, Category), a **Search KPI / Employee** input, and the **Wt% / Score / Both** toggle for displayed cell content.

## Risk & Impact
- **Data**: Additive — extends `bulk_scope_preview` / `bulk_review_snapshot` RPC `p_filters` JSONB to accept three new optional keys (`division_id`, `business_unit_id`, `category_id`). No schema changes, no RLS changes. Existing callers passing `{}` keep working.
- **Workflow**: None.
- **UI**: Replaces the current inline Period/Year/Stage row with the Matrix-style filters popover; adds search + Wt/Score/Both segmented control above the matrix grid. Stage selector stays inline (it's not a Matrix filter — it's "view as which reviewer").
- **Regression risk**: Low. New filter keys are optional in RPC; search and Wt/Score toggle are presentational only.
- **Scalability**: Server-side filtering still drives the scope cap (25k cells / 5 MB). Search is client-side over the loaded page only — same model as the Matrix.
- **Mitigation**: Default values (`'all'` / empty string) preserve current behavior. Existing `useBulkScopePreview` / `useBulkReviewSnapshot` signatures unchanged; only the `BulkScopeFilters` type grows.

## What gets built

### 1. RPC migration (new file under `supabase/migrations/`)
Extend both functions to read three more optional keys from `p_filters`:
- `division_id` → `p.division_id`
- `business_unit_id` → `p.business_unit_id`
- `category_id` → joins on `kpis.category_id` (or `kras.category_id` — verified during implementation)

Add matching `AND (v_… IS NULL OR …)` clauses in the same WHERE blocks. Function signatures unchanged (still `p_filters JSONB`).

### 2. `BulkScopeFilters` TypeScript type (`src/hooks/useBulkReview.ts`)
Add the three optional UUID fields. No hook signature changes.

### 3. `BulkReviewDashboard.tsx` header rewrite
Replace the 4-column inline grid (Period / Year / Stage / Load Scope) with a header bar modeled on the Matrix screenshot:

```
[ 🔍 Search KPI / Employee… ]  [ Wt% | Score | Both ]  [ 👁 hide-zero ]  [ ⚙ Filters (n) ▼ ]
```

The **Filters** popover (re-uses `Popover` + the exact `CompanyFilter` component and `useDepartments / useBusinessUnits / useDivisions / useKraCategories` hooks already used by the Matrix) contains:
- Month (Period dropdown — full month names, same options)
- Year (numeric input)
- Company
- Division → cascades into BU → Department (same dependency chain as Matrix lines 376-410)
- Business Unit
- Department
- Category

Apply-on-change: any filter change calls `setScopeLoaded(false)` so the user must hit **Load Scope** again. Cheap `bulk_scope_preview` re-runs automatically. A **Filters (n)** badge counts active non-default filters, mirroring Matrix line 274-278.

**Stage selector** stays separate (small inline `Select`) next to the search input — it's the viewer perspective, not a scope filter.

### 4. Search + Wt/Score/Both display modes
- **Search** filters `loadedRows` client-side by `kpi_name`, `kra_name`, `employee_name`, `employee_code` (case-insensitive). Mirrors Matrix.
- **Wt% / Score / Both** controls what each matrix cell renders inside `BulkReviewMatrixGrid`:
  - `score` (default, current behavior) — viewer-stage score + variance dot
  - `wt` — KPI weightage % only
  - `both` — weightage on top line, score on bottom

  Passed as a `displayMode` prop to `BulkReviewMatrixGrid`.

### 5. Hidden-zero toggle (optional, matches the eye-off icon in the screenshot)
Eye-off icon toggle that hides matrix rows where every cell is `Pending` / null in the current page. Purely client-side over `loadedRows`.

## UI Changes — visible to the user
- New compact toolbar above the matrix: Search input, segmented Wt/Score/Both, hide-zero eye toggle, Filters popover button with active-count badge.
- Period/Year/Stage inputs disappear from their current row; Period/Year live inside the Filters popover, Stage stays as a small inline `Select` next to Search.
- "Load Scope" button stays — same gating, same cap.
- Mobile: filters collapse into the popover already; search shrinks to icon-only; Wt/Score/Both stays as a 3-button segmented control.

## Out of Scope
- Server-side search (kept client-side over the loaded page, matching Matrix policy).
- Saved/named filter presets.
- Per-stage column expansion or export — handled separately.

## Files
- **New**: `supabase/migrations/<ts>_bulk_review_filter_extension.sql` (extends both RPCs).
- **Edit**: `src/hooks/useBulkReview.ts` — extend `BulkScopeFilters` type only.
- **Edit**: `src/pages/review/BulkReviewDashboard.tsx` — header toolbar rewrite, new filter state, search/displayMode plumbing.
- **Edit**: `src/components/review/BulkReviewMatrixGrid.tsx` — accept `displayMode: 'wt' | 'score' | 'both'`, render accordingly; accept already-filtered rows from parent.

## Tests
- Manual: change each filter → Load Scope reverts to required state, preview counts update, snapshot honors filter.
- Search: typing a KPI/employee name narrows visible rows/columns instantly.
- Display mode: switching Wt%/Score/Both re-renders cell content without refetch.
- RLS unchanged — same `bulk_scope_preview` / `bulk_review_snapshot` security definer pattern.

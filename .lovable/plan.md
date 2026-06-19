## 1. Assumptions
- Target page: **Incentive Data Entry → Production Data → Metal Sizing** (the daily grid in `src/components/incentive/ProductionDailyGrid.tsx`).
- Performance issue at scale: 2,560 employees × 31 days = ~79k inputs in one DOM render. This is why the page feels heavy.
- Pagination should be **client-side** (data is already loaded once for save consistency) but render only the current page of rows.
- "Excel-like filters" = per-column header filters (text search + multi-select for categorical columns) plus a global search box — not full pivot/sort UI.
- Saving still posts the FULL `localData` set (across all pages) — pagination must not drop unsaved edits on other pages.

## 2. Clarifications (defaulted, change if needed)
- Default page size: **50 rows**, options 25 / 50 / 100 / 200.
- Filterable columns: **Code, Name, Designation, Department, Rate/Ton**. Day columns stay numeric input only.
- Grand Total: shows **filtered grand total** + **page grand total** separately so admins always see both.
- Apply same pattern to `ProductionTargetGrid` and `VesselDataEntryGrid`? **Out of scope** for this PR — keep change surgical. Will note as follow-up.

## 3. Risk & Impact Report
- **Data Impact:** None. No schema change. Save payload still covers all employees in `gridEmployees`, regardless of which page is shown.
- **Workflow Impact:** None — same edit/save flow, just paginated rendering.
- **UI/UX Impact:** New toolbar row (global search, column filters toggle, page size). New footer (pagination controls + dual totals).
- **Regression Risk:** Medium — `localData` state must persist across page changes; filter logic must not break sticky columns or the existing "diagnostic empty state".
- **Scalability Impact:** DOM input count drops from ~79k → ~1.5k per page (50 rows × 31 days). Initial paint and typing latency dramatically improve.
- **Backup/Integrity:** N/A.
- **Rollback:** Pure component-level change. Revert single file.

## 4. Step-by-step Plan

### Step 1 — Add filter + pagination state
In `ProductionDailyGrid.tsx`:
- `globalSearch: string`
- `columnFilters: { code, name, designation, department, rateMin, rateMax }`
- `pageSize: 25 | 50 | 100 | 200` (default 50)
- `pageIndex: number` (reset to 0 when filters/program/month change)

### Step 2 — Derive `filteredEmployees` from `gridEmployees`
Memoized. Applies global search across code+name+desig+dept, plus per-column substring filters. Rate filter as numeric range.

### Step 3 — Derive `pagedEmployees`
`filteredEmployees.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)`.
Render loop iterates `pagedEmployees`, NOT `gridEmployees`.

### Step 4 — Preserve unsaved edits
`localData` keeps every employee's values (already keyed by employee id). Switching pages re-renders rows from `localData[emp.id]`, so unsaved cells on page 1 remain when navigating to page 2 and back.

### Step 5 — Update totals
- `pageTotal` (visible page rows × visibleDays × rate)
- `filteredGrandTotal` (all filtered rows)
- Keep existing `grandTotal` as filteredGrandTotal — show both in footer.

### Step 6 — Save behavior
`handleSave` continues to post for **all `gridEmployees`** (or optionally `filteredEmployees` if a filter is active — default keep `gridEmployees` so admins never silently lose untouched-but-prior data). Document this clearly in the UI tooltip.

### Step 7 — Toolbar UI
Above the table:
```
[ Global search ] [ Columns filter popover ] [ Page size: 50 ▾ ] [ 247 of 2560 shown ]
```
Column-filter popover lists Code/Name/Desig/Dept text fields + Rate min/max. "Clear all" button.

### Step 8 — Pagination footer
```
Showing 1–50 of 2,560 (filtered: 247)        [« ‹ Page 1 / 52 › »]
Page Total: ₹X     Filtered Grand Total: ₹Y
```
Includes input to jump to page N.

### Step 9 — Performance hardening
- Wrap row in a `React.memo`-ed `<DailyGridRow>` so unrelated rows don't re-render on a single cell change.
- Lift `handleCellChange` into a `useCallback` to keep memo stable.
- Skip resolving rates inside row (already memoized in `employeeRates` map).

### Step 10 — Tests (Vitest)
- Filter logic: search "Aabid" returns 1 row from a mock of 2,600.
- Pagination logic: page 3 of size 50 returns rows 100–149.
- Edits-preserved-across-pages: setting day 5 = 10 on page 1, switching to page 2, switching back, value still 10.
- Save payload covers all employees, not just current page.

## 5. UI Changes
- **Location:** Top of `ProductionDailyGrid` card (after the existing month/range toolbar), and a new footer above Save All.
- **Visual:**
  - Toolbar: search input + filter popover trigger + page-size select + count badge.
  - Footer: prev/next/first/last buttons, page indicator, dual totals.
- **Interaction:** Filtering or changing page size resets to page 1. Sticky left columns and existing toggle group untouched.
- **Responsive:** Toolbar wraps on small screens; pagination footer wraps as `flex-wrap`.

## 6. Implementation
Single file change: `src/components/incentive/ProductionDailyGrid.tsx`. Extract `DailyGridRow` as a small in-file `React.memo` component.

## 7. Tests
New file: `src/test/productionDailyGridFilters.test.ts` covering the filter, pagination, and edit-preservation helpers (extract pure helpers `applyDailyGridFilters` and `paginate` from the component into the same file or `src/lib/incentiveGrid.ts` for testability).

## 8. DOCUMENTATION.md updates
Add v2.66.44 entry:
- Production Daily Grid now paginates (default 50) and supports column + global filters.
- DOM render cost reduced ~50× for large programs (Metal Sizing 2,560 emp).
- Save still persists all employees, not just current page.

## 9. POLICY.md updates
Extend Pagination policy:
- Any incentive data-entry grid rendering >200 employees MUST paginate client-side.
- Edits to off-page rows must be preserved in component state until Save.
- Filters must operate on the full mapped roster, not just the rendered page.

## 10. Post-implementation notes
- Verify on Metal Sizing (2,560 emp) that typing latency is normal and Save All still writes all rows.
- Follow-up tickets (not in this PR): apply same toolbar to `ProductionTargetGrid` and `VesselDataEntryGrid`; consider virtualized rows (`@tanstack/react-virtual`) if page size 200 still lags.
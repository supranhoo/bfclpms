## Goal

You're right — the **Monthly Scorecard Report** currently only supports a single month (e.g. "April 2026"). To view the **monthly score trend per employee**, we'll add a **range mode** so you can pick a "From" and "To" period and see one row per employee with a column for each month in between.

## Risk & Impact Report

- **Data Impact**: None. Read-only — just queries `kpis` + `review_submissions` for the extra months.
- **Workflow Impact**: None. No changes to permissions or review processes.
- **UI/UX**: Adds a "View Mode" toggle (Single Month / Date Range). Default stays **Single Month** — existing users see no change unless they pick Range.
- **Regression Risk**: Low. Range mode runs in a separate code path; single-month rendering, exports, and PDF preview remain untouched.
- **Mitigation**: Range mode is gated behind the toggle; existing Excel/PDF export logic is preserved for single-month; range mode gets its own simpler Excel export.

## What Will Change

### 1. New "View Mode" toggle
At the top of `MonthlyScorecardReport.tsx`, add a Tabs control:
- **Single Month** (current behavior — preserved 100%)
- **Date Range (Trend View)** — new

### 2. Range mode UI
When Range is selected:
- **From Month / Year** + **To Month / Year** dropdowns (replaces the single Month/Year row)
- Default range = last 6 months ending at current month
- Quick presets: **Last 3 / 6 / 12 Months**
- Search box and Company filter remain

### 3. Range mode grid
A new `<MonthlyTrendTable>` rendering:

```text
Employee          Dept          Jan  Feb  Mar  Apr  May  Jun   Avg   Trend
Sanjay K. Dubey   3X100 TPD    3.8  4.0  4.1  4.2  4.0  4.3   4.07   ↑
Chandan Pandit    BFCL-BE      3.5  3.4  3.2  3.0  3.1  2.9   3.18   ↓
...
```

- Each cell shows the weighted **Final score** for that employee in that month (using the canonical 8-stage fallback chain — same `getBestScore` used in `PreviousMonthsScoreMini.tsx` and `useKpiEmployeeMatrix.ts`).
- **Avg** column = average of available months.
- **Trend arrow**: compares last vs first available month (↑ green / ↓ red / → gray).
- Empty months render as `-`.
- Color-coded cells (green ≥80%, yellow ≥60%, red <60% — matches existing convention).

### 4. Range mode Excel export
Single sheet with columns: Employee Code, Name, Designation, Department, Company, then one column per month in range, then Avg + Trend direction. Filename: `Monthly_Trend_<FromMon>-<ToMon>_<Year>.xlsx`.

### 5. Range mode PDF
Out of scope for this iteration (single-month detailed PDF stays as-is). A simple "Export Excel" is enough for trend analysis. We can add a landscape PDF later if needed.

## Technical Implementation

### New hook: `useMonthlyTrend.ts`
```typescript
useMonthlyTrend({ fromMonth, fromYear, toMonth, toYear, companyFilter })
  → { employees: Array<{ id, name, code, dept, designation,
                         monthlyScores: Record<"Jan 2026", number|null>,
                         avg, trend: 'up'|'down'|'flat' }> }
```
- Builds the list of `(month, year)` tuples between From and To.
- For each tuple, fetches `kpis` (paged 1000) + `review_submissions` (batched 500) — same pattern as `useKpiEmployeeMatrix.ts`.
- Computes the weighted score per employee per month (excludes `is_na`, weight ≤ 0, null scores) — per `mem://features/review/weighted-score-calculation-logic`.
- Returns sorted by employee name.

### Component changes
- `src/pages/reports/MonthlyScorecardReport.tsx` — add view mode state, conditionally render existing UI vs new `<MonthlyTrendView>`.
- `src/components/reports/MonthlyTrendView.tsx` (new) — range pickers, presets, table, Excel export.
- `src/components/reports/MonthlyTrendTable.tsx` (new) — the grid + trend arrows.
- `src/hooks/useMonthlyTrend.ts` (new) — data hook.

### Performance
- Reuses 5-min staleTime React Query cache.
- Range capped at **12 months** to keep payload reasonable.
- Uses paginated fetch (1000 rows/page) for `kpis` table.

### Consistency with existing code
- Score fallback uses the same `getBestScore` chain already in `PreviousMonthsScoreMini.tsx` and `useKpiEmployeeMatrix.ts`.
- Excludes `is_na` submissions per universal scoring rules.
- Color thresholds match `PreviousMonthsScoreMini.tsx` (80% / 60%).

## Documentation & Tests

- **DOCUMENTATION.md** — add a "Monthly Trend View" section under Monthly Scorecard Report (v2.66.7.50).
- **POLICY.md** — no policy change required (read-only view following existing scoring rules).
- **Unit tests** — `src/test/monthlyTrend.test.ts`:
  - Builds correct month list for cross-fiscal-year ranges (e.g. Oct 2025 → Mar 2026).
  - Excludes N/A KPIs from weighted average.
  - Trend arrow correct for up/down/flat.
  - Caps range at 12 months.

## Out of Scope (for now)

- Trend line chart (sparkline) — can be a follow-up if you want a visual line per employee.
- Department/Category drill-down inside the trend grid.
- Range PDF export.

If this looks right, approve and I'll implement it. If you'd also like a **mini sparkline chart per employee row** in the trend grid, say so and I'll add it.
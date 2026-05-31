## Goal
Add a **"Download Range"** option on the KPI Scorecard Detail report so Admin/HR can export all KPI rows for a contiguous month range (e.g. Sep 2025 → Apr 2026) in a single Excel file — without changing the on-screen single-month view.

## Assumptions
- Range export reuses the **same row shape and column set** as today's single-month export (no new fields). The existing `Month` column already distinguishes periods inside one sheet.
- Period iteration uses the existing `review_period` (month name) + `review_year` columns on `kpis` — one fetch per (month, year) pair in the range.
- Same RLS / company / department / search filters that apply to the on-screen view also apply to the range export, so an Auditor never exports rows they cannot see.
- Range is **inclusive** on both ends. Hard cap **12 months** per export to protect the browser and Data API.

## Risk & Impact Report
- **Data:** Read-only. No schema, no writes.
- **Workflow:** Additive UI button; existing single-month "Export" stays unchanged.
- **UI/UX:** One new outline button next to existing **Export**, opens a small popover with From/To selectors and a download button. No layout reflow.
- **Regression:** Low. New code path is isolated in `handleRangeExport`; current `handleExport` is untouched.
- **Scalability:** Each month already pages through `kpis` in 1000-row chunks and pulls `review_submissions` in 500-id chunks. For a 12-month range with ~1.8K KPIs/month, that's ~22K rows — within XLSX and browser limits. We hard-cap at 12 months and show a progress toast ("Fetching 3/8 …"). Sequential fetch keeps DB load identical to today's flow, just N times.
- **Rollback:** Pure additive UI + one helper function; revert the file.

## UI Changes — `src/pages/reports/KpiScorecardDetail.tsx`

Location: action row, immediately right of the existing **Export** button.

```text
[ Export ]  [ ⬇ Download Range ▾ ]
                    │
                    ▼ (Popover, 320px)
                    From  [ Sep ▾ ] [ 2025 ▾ ]
                    To    [ Apr ▾ ] [ 2026 ▾ ]
                    ───────────────────────────
                    Spans 8 months · max 12
                    [ Cancel ]   [ Download .xlsx ]
```

- **Trigger button:** outline, same height/size as Export, label "Download Range", `Download` icon.
- **Popover content:** four shadcn Selects (From-month, From-year, To-month, To-year). Year list = `[selectedYear-1, selectedYear, selectedYear+1]` (same as existing filter, no new master data needed).
- **Live counter** under the selects: "Spans N months · max 12". Turns destructive-red and disables the Download button when range is invalid (To before From) or > 12 months.
- **Filters notice:** small muted line — "Applies current Company / Department / Search filters."
- **Progress UX:** disable Download button while fetching; show toast "Fetching <Month> <Year> (3/8)…" between iterations; final success toast "Exported 22,418 rows across 8 months".
- **Permission gate:** entire button hidden when `canDownload('kpi-scorecard-detail')` is false (same gate as existing Export).
- **Responsive:** popover content uses `grid-cols-2 gap-2`; on `<sm` screens it stacks vertically. Button collapses to icon-only on `<md`.

No other pages, columns, or layouts change.

## Implementation Steps

1. **Helper `fetchScorecardForPeriod(month, year)`** (new top-level function in the same file) — extract the existing `queryFn` body so both the React Query hook and the range exporter call the same code path. Pure refactor, zero behavior change for the on-screen view.
2. **`handleRangeExport({fromMonth, fromYear, toMonth, toYear})`** — build the ordered list of `(month, year)` pairs from `MONTHS`, loop sequentially calling the helper, concat results, then apply the same Company / Department / Search filters and the same XLSX column mapping used by `handleExport`. File name: `KPI_Scorecard_${fromMonth}-${fromYear}_to_${toMonth}-${toYear}.xlsx`.
3. **`RangeExportPopover`** (small local component in same file) — the popover UI above; emits `handleRangeExport` on submit.
4. **Mount** the trigger next to the existing Export button inside the `canExport &&` block.

No edge function, no migration, no hook changes outside this file.

## Tests
- `kpiScorecardRange.test.ts` (new) — pure helpers:
  - `enumeratePeriods(from, to)` returns the correct ordered list (single month, 12-month wrap across years, reverse-range = empty).
  - `validateRange` flags > 12 months, To-before-From, and same-month-same-year as valid (1 month).
- Manual QA: open the page, pick Sep 2025 → Apr 2026, verify XLSX contains rows for all 8 months with the `Month` column populated.

## SSOT
- **DOCUMENTATION.md** → "Reports → KPI Scorecard Detail": document the range exporter, 12-month cap, filter semantics.
- **POLICY.md** → no policy change (read-only export gated by existing `kpi-scorecard-detail` download permission).
- **Memory:** append a one-liner under `mem://features/reports/` noting the range-export cap (12) and filter inheritance.

## Post-implementation notes
- 12-month cap is conservative; can be raised after measuring real-world payload sizes.
- If users later ask to export thousands of months or many companies in one go, move this to a backend edge function streaming a CSV — out of scope for now.

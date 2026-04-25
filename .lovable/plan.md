## Goal

Make the **Training Needs Identification (TNI) Report** support viewing data across **multiple assessment months** — including the full **Assessment Year (July → June)** — instead of only one month at a time. This lets HR/Management monitor the Training & Development KPI across the entire fiscal cycle.

## What you'll see in the UI

A new **Period Mode** selector at the top of the TNI Report, replacing the current single Year + Period dropdowns:

| Mode | Behaviour |
|---|---|
| **Single Month** | Current behaviour — pick one month (e.g. April 2026) |
| **QTD** | Quarter-to-date ending at selected month |
| **YTD** | Calendar year-to-date (Jan → selected month) |
| **AY (Jul–Jun)** ⭐ new | Full Assessment Year — auto-loads Jul of prior year through Jun of selected year (or current cycle if mid-year) |
| **Custom** | Pick any From → To range, even cross-year |

Below the selector, a small badge shows e.g. *"12 months · Jul 2025 → Jun 2026"* so users always know the active scope.

The **Detect TNI** button stays month-scoped (detection always runs on a single month — running it across 12 months in one click is unsafe). When a multi-month range is active, the button changes to a small dropdown: *"Detect for → [month]"*, defaulting to the latest month in the range.

## What changes under the hood

All four data hooks (`useTNISummary`, `useTrainingNeeds`, `useTNIByCategory`, `useTNIByDepartment`) currently take a single `reviewPeriod` + `reviewYear`. They will be extended to accept a `periodRanges: Array<{month, year}>` (the same shape already used by `ReviewPeriodSelectorEnhanced` elsewhere in the app — Multi-Period Aggregation pattern).

Queries switch from:
```
.eq('review_period', month).eq('review_year', year)
```
to:
```
.or( ranges.map(r => `and(review_period.eq.${r.month},review_year.eq.${r.year})`).join(',') )
```

Aggregations (category, department, summary cards) sum across all selected months. Duplicate (employee + KPI) rows across months are kept as separate records — each month's gap is a distinct identification, which matches how TNI is recorded today.

## Excel export

Export filename becomes `TNI_Report_<Mode>_<Range>.xlsx` (e.g. `TNI_Report_AY_Jul2025-Jun2026.xlsx`). Two sheets:
1. **Detail** — existing columns + already-present *Period* / *Year* columns (so AY exports show which month each gap came from).
2. **Monthly Summary** ⭐ new — pivot of Skill Gaps / Compliance Gaps / High Priority / Employees Affected per month, so you can see the trend across the AY at a glance.

## Files to change

- `src/hooks/useTNI.ts` — extend 4 hooks to accept `periodRanges`; build OR-filter
- `src/pages/reports/TNIReport.tsx` — swap single-month picker for new mode selector; wire ranges; update Detect button to month-picker dropdown when multi-month; add Monthly Summary sheet to export
- `src/components/reports/TNIPeriodSelector.tsx` ⭐ new — small wrapper around the existing pattern that adds the **AY (Jul–Jun)** preset on top of Single/QTD/YTD/Custom
- `src/test/bugBountyFixes.test.ts` — add `BUG-026`: multi-period filter returns union of months; AY preset spans Jul→Jun correctly across year boundary
- `DOCUMENTATION.md` — bump to v2.66.7.28, document AY preset and multi-period TNI
- `POLICY.md` — §99: TNI monitoring scope — single month is operational, AY is for KPI evaluation

## Risk & Impact

- **Data**: Read-only change. No schema or RLS changes. Detection RPC stays single-month (safe).
- **Workflow**: Default mode on first load = **Single Month / current month** → existing users see no change unless they switch modes.
- **Performance**: Worst case AY = 12 months × ~rows per month. Existing TNI tables are small (one row per low-score KPI per employee per month); single SELECT with OR-filter is fine. We add a `staleTime` of 2 min to avoid refetches when toggling tabs.
- **Regression**: Single-month path is preserved as a special case (`periodRanges.length === 1`). Existing tests stay green.

## Out of scope (will not be done)

- Bulk multi-month detection — kept single-month for safety. If you want one-click "Detect AY", say so and we'll add a confirmation dialog that loops month-by-month.
- Changing how TNI rows are stored (still one row per month per gap).

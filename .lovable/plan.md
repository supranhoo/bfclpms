

# Fix: Show "N/A" for Not-Applicable KPIs in Tracker and History Views

## Problem

When a KPI is marked as "Not Applicable" for a given month (e.g., November, December), the KPI Tracker Modal and History Card show "-" in the Achieved column instead of "N/A". The `is_na` flag exists on submissions but is never checked in these display components.

## Affected Components

| Component | File | Current Display | Fix |
|---|---|---|---|
| KPI Tracker Modal (table) | `src/components/dashboard/KpiTrackerModal.tsx` | Shows "-" for N/A months | Show "N/A" badge |
| KPI Tracker Modal (chart) | Same file | Plots null as gap | Exclude N/A months from trend line |
| KPI History Card (inline) | `src/components/review/KpiHistoryCard.tsx` | Shows "0/100" for N/A months | Show "N/A" instead |

The `KpiDetailsTable` already handles this correctly (line 328-329 shows N/A badge).

## Changes

### 1. `src/components/dashboard/KpiTrackerModal.tsx`

**Data layer** (lines 43-65): Add `isNa: boolean` to the monthly data structure. When building each entry, read `sub.is_na` from the submission.

**Chart**: For N/A months, set `achieved` and `target` to `null` so the trend line skips them cleanly (Recharts handles null gaps by default).

**Table** (line 160): Instead of showing "-" when achieved is null, check `isNa` first. If true, show an amber "N/A" badge. Same for the Rating column.

### 2. `src/components/review/KpiHistoryCard.tsx`

**Data layer** (lines 38-48): Add `isNa: boolean` to each entry, read from `sub?.is_na`.

**Display** (lines 123-124): Where it currently shows `{entry.achieved}/{entry.target}`, check `isNa` first. If true, show "N/A" text instead of the numeric ratio.

**Score badge** (line 127): Show "N/A" instead of "-" for N/A months.

**Sparkline**: Exclude N/A entries from the chart data so the trend line only reflects actual performance.

### 3. `DOCUMENTATION.md`

Document that N/A months are visually distinguished in tracker and history views.

## Files to Modify

- `src/components/dashboard/KpiTrackerModal.tsx`
- `src/components/review/KpiHistoryCard.tsx`
- `DOCUMENTATION.md`


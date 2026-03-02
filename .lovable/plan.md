

# Fix: KPI Weightage Dashboard - Fiscal Year & Data Fetching

## Problem

Two issues preventing data from showing:

1. **Fiscal Year Mismatch**: The assessment year runs July-June (e.g., "2025-26" = Jul 2025 to Jun 2026). KPIs in Jul-Dec have `review_year = 2025`, while Jan-Jun have `review_year = 2026`. The current hook only queries one `review_year`, so it always misses half the data.

2. **Year Selector**: The dashboard uses a plain calendar year (2026), but should use a fiscal year picker matching the existing KPI Mapping Matrix pattern.

## Fix Plan

### File: `src/hooks/useKpiWeightageMatrix.ts`

- Change the `year` parameter to represent the fiscal year **start** year (e.g., 2025 for "2025-26")
- Fetch KPIs from **both** `review_year = year` (Jul-Dec) and `review_year = year + 1` (Jan-Jun), matching the pattern used in `useAdminReports.ts`
- Update `MONTH_ORDER` to fiscal order: July, August, ..., May, June
- The baseline month becomes July (first month of the fiscal year) instead of January

### File: `src/pages/admin/KpiWeightageDashboard.tsx`

- Change year selector to fiscal year format: show "2025-26", "2024-25", etc. (matching `KpiMappingMatrix.tsx` pattern)
- Compute default fiscal year: if current month is before July, default to `currentYear - 1`; otherwise `currentYear`
- Update export filename to include fiscal year label

## Technical Details

- Follows the exact same fiscal year pattern already used in `useAdminReports.ts` (fetches two `review_year` values via `Promise.all`)
- No database changes needed
- Only 2 files modified
- Month columns will display in fiscal order: Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun


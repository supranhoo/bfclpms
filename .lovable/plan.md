

# KPI Mapping Matrix: July-June Fiscal Year Cycle

## Overview

Change the KPI Mapping Matrix from a January-December calendar year layout to a **July-June fiscal year** layout. The columns will reorder to Jul-Jun, the year selector will show fiscal years (e.g., "2025-26"), and the data query will span two calendar years.

## Changes

### 1. `src/pages/admin/KpiMappingMatrix.tsx` -- Reorder Columns and Fiscal Year Selector

**Column headers** change from `[Jan, Feb, ..., Dec]` to `[Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun]`.

**Month keys** reorder accordingly: `[jul, aug, sep, oct, nov, dec, jan, feb, mar, apr, may, jun]`.

**Year selector** displays fiscal year labels like "2025-26" instead of "2025". The stored value remains the start year (e.g., 2025 for Jul 2025 - Jun 2026).

**Excel export** mirrors the new column order with fiscal year in the filename (e.g., `KPI_Mapping_Matrix_2025-26.xlsx`).

### 2. `src/hooks/useAdminReports.ts` -- Fetch Two Calendar Years

Currently fetches KPIs for a single `review_year`. For a fiscal year starting July 2025:
- Fetch KPIs with `review_year = 2025` and `review_period` in Jul-Dec
- Fetch KPIs with `review_year = 2026` and `review_period` in Jan-Jun

The month-to-column mapping will use the fiscal order (Jul=0, Aug=1, ..., Jun=11) so the matrix correctly shows 12 columns in fiscal sequence.

The "First Mapped Month" will be computed based on the fiscal order (earliest month in the Jul-Jun sequence).

### 3. `DOCUMENTATION.md` -- Version Bump

Version bump to 1.45.70.

## Technical Details

**Data fetch strategy:**
```text
Fiscal year 2025-26:
  Query 1: review_year = 2025, review_period IN ('July','August',...,'December')
  Query 2: review_year = 2026, review_period IN ('January','February',...,'June')
```

Both queries use the existing batched fetch pattern (1000 rows per batch).

**Fiscal month index mapping:**
```text
Jul=0, Aug=1, Sep=2, Oct=3, Nov=4, Dec=5,
Jan=6, Feb=7, Mar=8, Apr=9, May=10, Jun=11
```

**Risk Assessment:**

| Risk | Assessment |
|------|-----------|
| Data Impact | None -- read-only query, no schema changes |
| Regression Risk | Low -- only changes column order and query filter |
| UI Consistency | Same table layout, just reordered months |


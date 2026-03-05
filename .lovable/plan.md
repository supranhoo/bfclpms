

# Replace Period Selector with Multi-Month + Fiscal Year (Jul-Jun)

## Current State
The dashboard has a calendar-year dropdown (2024/2025/2026) and a single "All Periods" month picker. The user wants:
1. **Multi-month selection** — ability to pick multiple months at once
2. **Fiscal year scale** — July to June (e.g., "FY 2025-26" = Jul 2025 → Jun 2026)

## Plan

### 1. Replace Year Selector with Fiscal Year Selector
- Options like: `FY 2025-26`, `FY 2024-25`, `FY 2023-24`
- Selecting `FY 2025-26` means months July 2025 through June 2026
- State changes from `selectedYear: string` to `selectedFiscalYear: number` (the start year, e.g. 2025 for FY 2025-26)

### 2. Replace Single Period Dropdown with Multi-Month Toggle Grid
- Display 12 months in fiscal order: Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun
- Each month is a toggle button (click to select/deselect)
- "All" button to select all months at once
- State changes from `selectedPeriod: string` to `selectedMonths: string[]`

### 3. Update Query Logic
- Currently queries with `.eq('review_year', year)` and optionally `.eq('review_period', period)`
- New: query with `.in('review_period', selectedMonths)` and handle cross-year fiscal periods by querying two calendar years (Jul-Dec of start year + Jan-Jun of end year)
- The `fetchPeriodData` function will accept an array of `{month, year}` pairs instead of a single period

### 4. Update Previous Period Comparison
- When multiple months are selected, disable or skip the "compare with previous period" logic (it only makes sense for single-month view)

### 5. Update PDF Export
- Change filename and header to reflect fiscal year and selected months

### Files to Modify
1. `src/pages/ManagementDashboard.tsx` — All changes contained here (state, header UI, query logic, export)



# Cumulative Performance View - Implementation Plan

## Status: Phase 1-4 Complete ✅

---

## Overview

This feature adds the ability to view performance across multiple periods - supporting **Year-to-Date (YTD)**, **Quarter-to-Date (QTD)**, and **Custom Date Ranges** - giving stakeholders a holistic view of employee performance over time.

---

## Completed Implementation

### ✅ Phase 1: Enhanced Period Selector Component
**File:** `src/components/ui/ReviewPeriodSelectorEnhanced.tsx`

- Mode toggle: Single Month | YTD | QTD | Custom
- Auto-calculates period ranges for each mode
- Cross-year support for Custom mode
- Returns `PeriodSelection` with `periodRanges` array

### ✅ Phase 2: Cumulative Data Fetching Hook
**File:** `src/hooks/useCumulativeKpis.ts`

- Fetches KPIs across multiple periods using OR conditions
- Groups by KPI template (kra_name + kpi_name + category_id)
- Calculates weighted averages and trends
- Returns `CumulativeKpisResult` with aggregated data

### ✅ Phase 3: Cumulative Score Calculations
**File:** `src/lib/cumulativeScoring.ts`

Functions:
- `calculateCumulativeScore()` - Weighted average across periods
- `calculateTrend()` - Determines improving/stable/declining
- `calculateTrendFromPeriodScores()` - Chronological trend analysis
- `calculateCategoryCumulative()` - Category-level aggregation
- `calculateOverallCumulativeScore()` - Overall performance metrics

### ✅ Phase 4: Dashboard Integration
**File:** `src/pages/Dashboard.tsx`

- Integrated `ReviewPeriodSelectorEnhanced` component
- Conditional data fetching (single vs cumulative)
- `CumulativeSummaryCard` display in cumulative modes
- Metrics adapt based on period mode

### ✅ UI Components Created
- `src/components/dashboard/CumulativeSummaryCard.tsx` - Period summary display
- `src/components/dashboard/KpiTrendIndicator.tsx` - Trend arrows (↗ → ↘)

---

## Remaining Work (Future Phases)

### Phase 5: Cumulative KPI Table Enhancements
- Add period-by-period score columns in cumulative mode
- Add trend column to KPI table
- Mini sparkline visualization for score progression

### Phase 6: UnifiedScorecard Cumulative Support
- Pass period mode to reviewer scorecards
- Multi-period view for team review scenarios
- Aggregate employee performance across periods

### Phase 7: Advanced Reporting
- Export cumulative reports to PDF/Excel
- Period comparison views
- Trend analysis charts

---

## Technical Notes

### Period Ranges Structure
```typescript
interface PeriodSelection {
  mode: 'single' | 'ytd' | 'qtd' | 'custom';
  selectedMonth: string;
  selectedYear: number;
  months: string[];
  customStartMonth?: string;
  customStartYear?: number;
  periodRanges: Array<{ month: string; year: number }>;
}
```

### Score Aggregation Logic
1. Fetch KPIs matching any period in `periodRanges`
2. Group by `kra_name + kpi_name + category_id`
3. Calculate weighted average using `final_score || manager_score || self_score`
4. Determine trend from last 3 periods using linear regression slope

### Performance Considerations
- React Query caching with 5-minute staleTime
- OR conditions in Supabase query (efficient single query)
- Memoized calculations to prevent re-renders

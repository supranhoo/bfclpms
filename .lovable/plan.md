
# Cumulative Performance View - Implementation Plan

## Overview

This feature adds the ability to view performance across multiple periods - supporting **Year-to-Date (YTD)**, **Quarter-to-Date (QTD)**, and **Custom Date Ranges** - giving stakeholders a holistic view of employee performance over time.

---

## Current State Analysis

**How it works today:**
- `ReviewPeriodSelector` allows selecting a single month + year
- Dashboard/Scorecards filter KPIs where `review_period === selectedPeriod && review_year === selectedYear`
- Charts and scores show data for that single month only
- No aggregation across multiple periods exists

**Database Structure:**
- KPIs have `review_period` (month name) and `review_year` (integer)
- Each month's KPI is a separate record (same KPI template creates new records per period)
- `review_submissions` stores scores per KPI (which is per-period)

---

## Proposed Solution

### New Period Selection Modes

| Mode | Description | Months Included |
|------|-------------|-----------------|
| **Single Month** | Current behavior | 1 month |
| **YTD** | January to selected month | 1-12 months |
| **QTD** | Quarter start to selected month | 1-3 months |
| **Custom Range** | User-defined start/end months | Variable |

---

## Phase 1: Enhanced Period Selector Component

### New Component: `ReviewPeriodSelectorEnhanced.tsx`

**Features:**
- Mode toggle: Single Month | YTD | QTD | Custom
- When YTD: Auto-calculates January through selected month
- When QTD: Auto-calculates quarter start through selected month
- When Custom: Shows "From" and "To" month/year pickers
- Returns: `{ mode, months: string[], year: number }` or `{ mode, startMonth, endMonth, startYear, endYear }`

**UI Preview:**
```text
[Single Month] [YTD] [QTD] [Custom]
              [January v] [2026 v]
              
-- OR for Custom --

[Single Month] [YTD] [QTD] [Custom]
From: [January v] [2025 v]  To: [December v] [2025 v]
```

---

## Phase 2: Cumulative Data Fetching Hook

### New Hook: `useCumulativeKpis.ts`

**Purpose:** Fetch and aggregate KPIs across multiple periods

**Logic:**
```typescript
interface CumulativeKpisResult {
  // All KPIs across the period range
  allKpis: KPI[];
  // Aggregated by KPI template (same kra_name + kpi_name + employee_id)
  aggregatedKpis: AggregatedKpi[];
  // Period summary
  periodSummary: {
    totalPeriods: number;
    periodsWithData: number;
    startPeriod: string;
    endPeriod: string;
  };
}

interface AggregatedKpi {
  kpi_name: string;
  kra_name: string;
  category_id: string;
  employee_id: string;
  // Aggregate metrics
  avgScore: number | null;
  totalSubmissions: number;
  periodScores: { period: string; year: number; score: number | null }[];
  // Trend
  trend: 'improving' | 'declining' | 'stable';
  weightage: number;
}
```

**Aggregation Method:**
- Group KPIs by `kra_name + kpi_name + employee_id + category_id`
- For each group, calculate weighted average of `final_score` (or `manager_score`/`self_score` as fallback)
- Track individual period scores for trend visualization

---

## Phase 3: Dashboard Integration

### Changes to `Dashboard.tsx`

**State Updates:**
```typescript
const [periodMode, setPeriodMode] = useState<'single' | 'ytd' | 'qtd' | 'custom'>('single');
const [selectedPeriods, setSelectedPeriods] = useState<string[]>([currentMonth]);
```

**Conditional Data Fetching:**
```typescript
// If single month - use existing hooks
// If cumulative - use new useCumulativeKpis hook

const { data: kpis } = periodMode === 'single' 
  ? useMyKpis() 
  : useCumulativeKpis(userId, selectedPeriods, selectedYear);
```

**Chart Adjustments:**
- Overall Score: Show weighted average across all periods
- Category Chart: Aggregate category scores across periods
- KPI Table: Show period-by-period breakdown with mini sparkline

---

## Phase 4: Cumulative Score Calculations

### New Utility: `src/lib/cumulativeScoring.ts`

**Functions:**
```typescript
// Calculate weighted average across periods
function calculateCumulativeScore(
  periodScores: { score: number; weightage: number }[]
): number;

// Determine performance trend
function calculateTrend(
  periodScores: number[]
): 'improving' | 'declining' | 'stable';

// Calculate category cumulative performance
function calculateCategoryCumulative(
  kpis: AggregatedKpi[],
  categoryId: string
): { avgScore: number; trend: string };
```

---

## Phase 5: UI Enhancements for Cumulative View

### KPI Table with Period Breakdown

When in cumulative mode, the KPI details table shows:

| KPI Name | Category | Jan | Feb | Mar | Avg Score | Trend |
|----------|----------|-----|-----|-----|-----------|-------|
| Sales Target | Revenue | 4 | 3 | 5 | 4.0 | ↗ |
| Customer Calls | Service | 3 | 4 | 4 | 3.7 | → |

### Trend Indicators
- ↗ Improving (last 3 periods trending up)
- → Stable (variance < 10%)
- ↘ Declining (last 3 periods trending down)

### Period Summary Card
```text
┌─────────────────────────────────────┐
│ YTD Performance Summary             │
│ Jan 2026 - Mar 2026 (3 months)     │
│                                     │
│ Avg Score: 3.8/5  │  Trend: ↗      │
│ Completed: 24/30  │  Pending: 6    │
└─────────────────────────────────────┘
```

---

## Phase 6: UnifiedScorecard Cumulative Support

### Changes to `UnifiedScorecard.tsx`

- Accept period mode from parent Dashboard
- When cumulative, fetch employee KPIs across all selected periods
- Aggregate scores with period-by-period visibility
- Maintain ability to drill into individual period details

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/ui/ReviewPeriodSelectorEnhanced.tsx` | Create | Multi-period selection UI |
| `src/hooks/useCumulativeKpis.ts` | Create | Aggregate KPIs across periods |
| `src/lib/cumulativeScoring.ts` | Create | Scoring calculation utilities |
| `src/pages/Dashboard.tsx` | Modify | Integrate cumulative mode |
| `src/components/review/UnifiedScorecard.tsx` | Modify | Support cumulative view |
| `src/components/dashboard/CumulativeSummaryCard.tsx` | Create | Period summary display |
| `src/components/dashboard/KpiTrendIndicator.tsx` | Create | Trend arrow component |
| `DOCUMENTATION.md` | Update | Document cumulative feature |

---

## Technical Considerations

### Performance
- Cumulative queries may return large datasets (12 months × n KPIs)
- Implement pagination or lazy loading for large teams
- Cache aggregated results with React Query

### Edge Cases
- KPIs that don't exist in all periods (new assignments mid-year)
- Period-specific KPIs (quarterly KPIs shouldn't be averaged monthly)
- Handle mix of approved/pending statuses across periods

### Scoring Logic
- Use `final_score` when available (approved)
- Fallback to `manager_score` → `auditor_score` → `self_score`
- Weight by KPI weightage when aggregating

---

## Implementation Order

1. **Phase 1**: Create `ReviewPeriodSelectorEnhanced` with mode toggle
2. **Phase 2**: Build `useCumulativeKpis` hook with aggregation logic
3. **Phase 3**: Create scoring utilities in `cumulativeScoring.ts`
4. **Phase 4**: Integrate into Dashboard with conditional rendering
5. **Phase 5**: Add cumulative support to UnifiedScorecard
6. **Phase 6**: Build summary cards and trend indicators
7. **Phase 7**: Update documentation

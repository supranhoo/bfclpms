
# Plan: Update Daily Binary KPI Calculation Logic

## Overview

This update modifies the aggregation logic for **Daily Binary KPIs** to count both missed submissions AND "No" values when calculating the final monthly score.

---

## Current vs. New Logic

| Aspect | Current Implementation | New Implementation |
|--------|----------------------|-------------------|
| Missed Days | Counted as penalty | Counted as "No" |
| "No" Submissions | Averaged with "Yes" values | Counted as "No" |
| Total Count | Missed days only | Missed days + "No" submissions |
| Score Formula | `5 - missedDays` | `5 - totalNoCount` (where totalNoCount = missedDays + noSubmissions) |

### New Scoring Table

| Total "No" Count | Final Score |
|-----------------|-------------|
| 0 | 5 |
| 1 | 4 |
| 2 | 3 |
| 3 | 2 |
| 4 | 1 |
| >4 | 0 |

---

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/dailyAggregation.ts` | Add new aggregation method for binary KPIs that counts "No" + missed days |
| `src/pages/MyKpis.tsx` | Pass KPI uom_type to aggregation function for binary-specific logic |
| `src/components/review/DailySubmissionSummary.tsx` | Update stats display to show combined "Total No" count |
| `DOCUMENTATION.md` | Document the updated binary KPI scoring logic |

---

### Phase 1: Update `dailyAggregation.ts`

**1.1 Add new interface and function for binary-specific calculation:**

```typescript
export interface BinaryAggregationResult extends AggregationResult {
  noSubmissions: number;    // Count of "No" (achieved_value = 0)
  totalNoCount: number;     // missedDays + noSubmissions
}

/**
 * Calculate score for binary daily KPIs
 * Total No = Missed Days + "No" submissions
 * Score: 0 No = 5, 1 No = 4, 2 No = 3, 3 No = 2, 4 No = 1, >4 No = 0
 */
export function calculateBinaryDailyScore(
  submittedValues: number[],
  month: string,
  year: number
): BinaryAggregationResult {
  const totalDays = getExpectedDaysInMonth(month, year);
  const submittedDays = submittedValues.length;
  const missedDays = Math.max(0, totalDays - submittedDays);
  
  // Count "No" submissions (achieved_value = 0)
  const noSubmissions = submittedValues.filter(v => v === 0).length;
  
  // Total No = missed days + "No" submissions
  const totalNoCount = missedDays + noSubmissions;
  
  // Score calculation: 0 No = 5, each No reduces by 1, minimum 0
  const score = Math.max(0, 5 - totalNoCount);

  return {
    score,
    method: 'missed_days_penalty', // Still uses this method type
    submittedDays,
    totalDays,
    missedDays,
    noSubmissions,
    totalNoCount,
  };
}
```

**1.2 Update main aggregation function to handle binary KPIs:**

```typescript
export function calculateDailyAggregatedScore(
  submittedValues: number[],
  method: DailyAggregationMethod,
  month: string,
  year: number,
  isBinaryKpi: boolean = false  // New parameter
): AggregationResult | BinaryAggregationResult {
  // For binary KPIs with missed_days_penalty, use the new binary-specific logic
  if (isBinaryKpi && method === 'missed_days_penalty') {
    return calculateBinaryDailyScore(submittedValues, month, year);
  }
  
  // Existing logic for non-binary KPIs
  const totalDays = getExpectedDaysInMonth(month, year);
  const submittedDays = submittedValues.length;
  const missedDays = Math.max(0, totalDays - submittedDays);

  let score: number | null = null;

  if (method === 'average') {
    score = calculateAverageScore(submittedValues);
  } else if (method === 'missed_days_penalty') {
    score = submittedDays > 0 
      ? calculateMissedDaysPenaltyScore(submittedDays, totalDays)
      : null;
  }

  return {
    score,
    method,
    submittedDays,
    totalDays,
    missedDays,
  };
}
```

---

### Phase 2: Update `MyKpis.tsx`

Update all calls to `calculateDailyAggregatedScore` to pass the `isBinaryKpi` flag:

**2.1 In `aggregatedMonthlyScore` useMemo:**
```typescript
const aggregatedMonthlyScore = useMemo(() => {
  // ...existing code...
  const isBinaryKpi = selectedKpi?.uom_type === 'binary';
  const result = calculateDailyAggregatedScore(
    values, 
    dailyAggregationMethod, 
    selectedPeriod, 
    selectedYear,
    isBinaryKpi
  );
  return result.score;
}, [selectedKpiSubPeriods, dailyAggregationMethod, selectedPeriod, selectedYear, selectedKpi]);
```

**2.2 In `handleSubmitMonthlyReview`:**
```typescript
const isBinaryKpi = selectedKpi?.uom_type === 'binary';
const aggregationResult = calculateDailyAggregatedScore(
  values, 
  dailyAggregationMethod, 
  selectedPeriod, 
  selectedYear,
  isBinaryKpi
);
```

**2.3 In KPI table display:**
```typescript
const aggregatedScore = needsSubPeriod && kpiSubPeriods.length > 0 
  ? calculateDailyAggregatedScore(
      kpiSubPeriods.filter(s => s.achieved_value !== null).map(s => s.achieved_value as number),
      dailyAggregationMethod,
      selectedPeriod,
      selectedYear,
      kpi.uom_type === 'binary'
    ).score
  : null;
```

---

### Phase 3: Update `DailySubmissionSummary.tsx`

Update the stats calculation to show the combined "Total No" count for clarity:

```typescript
const stats = useMemo(() => {
  const monthNumber = getMonthNumber(reviewMonth);
  const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
  
  const submittedCount = submissions.length;
  const missingCount = daysInMonth - submittedCount;
  
  const isBinary = uomType === 'binary';
  const noCount = isBinary 
    ? submissions.filter(s => s.achieved_value === 0).length 
    : 0;
  
  // NEW: Total No = missed + explicit "No" submissions
  const totalNoCount = missingCount + noCount;
  
  return { daysInMonth, submittedCount, missingCount, noCount, isBinary, totalNoCount };
}, [submissions, reviewMonth, reviewYear, uomType]);
```

Add a new stats card showing "Total No" count:

```tsx
{stats.isBinary && (
  <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center">
    <div className="flex items-center justify-center gap-1 mb-1">
      <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
    </div>
    <p className="text-xl font-bold text-orange-600">{stats.totalNoCount}</p>
    <p className="text-xs text-muted-foreground">Total No</p>
  </div>
)}
```

---

### Phase 4: Update Documentation

Add to `DOCUMENTATION.md`:

```markdown
### Daily Binary KPI Scoring (Missed Days Penalty)

For Daily KPIs with Binary targets (Yes/No), the monthly score is calculated as:

**Total No = Missed Days + "No" Submissions**

| Total No Count | Final Score |
|---------------|-------------|
| 0 | 5 (Outstanding) |
| 1 | 4 (Exceeds) |
| 2 | 3 (Meets) |
| 3 | 2 (Below) |
| 4 | 1 (Needs Improvement) |
| >4 | 0 (Unacceptable) |

Example: If a month has 31 days, and an employee:
- Submitted 28 days (3 missed)
- Of those 28, had 2 "No" responses

Total No = 3 + 2 = 5 → Score = 0
```

---

## Testing Checklist

1. **Binary Daily KPI Calculation**
   - [ ] 0 missed + 0 "No" = Score 5
   - [ ] 2 missed + 1 "No" = Score 2 (Total 3)
   - [ ] 5 missed + 0 "No" = Score 0 (Total 5)
   - [ ] 0 missed + 5 "No" = Score 0 (Total 5)

2. **Non-Binary KPIs Unaffected**
   - [ ] Numeric daily KPIs still use average/missed days as before
   - [ ] Tiered KPIs with multiple options still work correctly

3. **UI Display**
   - [ ] DailySubmissionSummary shows correct "Total No" count
   - [ ] Monthly score preview reflects new calculation

4. **Edge Cases**
   - [ ] No submissions at all = All days missed = Score based on total days
   - [ ] All submissions are "Yes" and no missed = Score 5

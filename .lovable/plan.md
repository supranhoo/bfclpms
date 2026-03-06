

# Fix: Performance Trend Still Showing Low Scores

## Root Cause Analysis

After querying the database directly, the actual weighted averages per month are:
- September 2025: **2.67**
- October 2025: **2.93**
- November 2025: **3.03**
- December 2025: **3.07**
- January 2026: **1.56**
- February 2026: **0.03** (most KPIs scored 0)

The trend chart code fix (multiplying `score * w`) is mathematically correct in the file. However, two additional issues remain:

1. **`calculateMetrics` has the same unfixed bug** (line 232): The main "Weighted Avg Score" metric card adds raw scores without multiplying by weightage, then divides by total weightage — producing deflated values. This affects the primary score card, not the trend chart.

2. **Missing fields in query**: The `review_submissions` select (line 183) does not fetch `hr_pms_score` or `skip_level_score`, which are referenced in the `getScore` fallback chain. If `final_score` is 0 (not null), the fallback won't trigger, but this is still a correctness gap.

3. **Months with no real data still included**: February 2026 has 1503 KPIs but almost all scored 0.00 (weighted avg 0.033). March/April/May/June 2026 have KPIs with nil scores. The `getScore` function correctly returns `null` for nil scores (skipping them), but 0.00 final_scores ARE included. This is technically correct — those KPIs were scored 0 — but the chart shows these months dragging the trend down, which is misleading.

## Changes

### File: `src/pages/ManagementDashboard.tsx`

**Fix A — `calculateMetrics` weighted average (line 232)**
Change:
```typescript
kpiList.forEach(kpi => { totalScore += getScoreOrZero(kpi); totalWeightage += kpi.weightage || 100; });
const avgScore = totalWeightage > 0 ? (totalScore / totalWeightage) * 100 : 0;
```
To:
```typescript
kpiList.forEach(kpi => {
  const s = getScore(kpi);
  if (s !== null) {
    const w = kpi.weightage || 100;
    totalScore += s * w;
    totalWeightage += w;
  }
});
const avgScore = totalWeightage > 0 ? (totalScore / totalWeightage) : 0;
```
This fixes the same multiplication bug for metric cards, removes the `* 100` (scores are 0-5, not percentage), and skips KPIs with no submission data.

**Fix B — Add missing fields to query (line 183)**
Add `hr_pms_score, skip_level_score` to the `review_submissions` select for complete fallback chain coverage.

**Fix C — Performance Trend: skip months where data is mostly unprocessed**
The current filter only checks `hasScores: true`. Add a secondary filter: only include months where the weighted average is meaningful (at least 1 KPI with a non-zero score exists). This prevents months like Feb 2026 (avg 0.03) from distorting the trend when the data is essentially unprocessed.


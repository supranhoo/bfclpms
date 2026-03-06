

# Bug Fix: Performance Trend Showing Incorrect (Low) Scores

## Root Cause

In `src/pages/ManagementDashboard.tsx` line 373, the trend data accumulation adds the raw `score` to `total` without multiplying by the KPI's weightage (`w`), but the average is calculated by dividing `total / weightage`. This mismatch deflates scores dramatically.

**Example**: 5 KPIs each scored 4.0 with weightage 100:
- Current (buggy): total = 4+4+4+4+4 = 20, weightage = 500 → avg = 0.04
- Correct: total = 400+400+400+400+400 = 2000, weightage = 500 → avg = 4.0

This explains why the chart shows ~0.5 instead of realistic scores in the 3-5 range.

## Fix

**File: `src/pages/ManagementDashboard.tsx`** (line 373)

Change:
```typescript
existing.total += score;
```
To:
```typescript
existing.total += score * w;
```

And line 374 (new entry case):
```typescript
periodScores.set(period, { total: score, weightage: w, hasScores: true });
```
To:
```typescript
periodScores.set(period, { total: score * w, weightage: w, hasScores: true });
```

This aligns the trend calculation with the same weighted-average formula used correctly elsewhere in the file (e.g., Top Performers on line 310, Bottom Performers on line 354).

Single-line fix, no schema or RLS changes needed. Zero regression risk — only corrects a math error.


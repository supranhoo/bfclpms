

## RCA: Org KPI Achieved Value Not Shown in Review Journey

### Root Cause

**The Review Journey section only reads `achieved_value` from `review_submissions`, but for Org KPIs the achieved value is stored in `org_kpi_values` — and never copied to `review_submissions` until self-review is submitted.**

| Component | Data Source | Shows 27.9%? |
|-----------|-----------|:---:|
| KPI Details Table (line 544) | `orgValue?.achieved_value ?? submission?.achieved_value` | ✅ |
| Review Journey (line 341) | `submission?.achieved_value` only | ❌ |

For KPI `c401adcb` (employee 100316, WHRB, Feb-Mar Bi-Monthly):
- `org_kpi_values` has `achieved_value = 27.9` for March (terminal month), status `approved`
- `review_submissions` has `achieved_value = null` (KPI still at `kra_set` — no self-review yet)
- Result: Details table shows 27.9% via org lookup; Journey cards show nothing

### Fix

Pass the org KPI achieved value into `KpiJourneySection` so the Self stage card can display it as a fallback when `submission?.achieved_value` is null.

#### Part 1: Add `orgAchievedValue` prop to `KpiJourneySection`

Add an optional `orgAchievedValue?: number | null` prop. In the Self stage `buildStage` call (line 341), use:
```
submission?.achieved_value ?? orgAchievedValue ?? null
```

#### Part 2: Pass org value from `KpiReviewPanel`

`KpiReviewPanel` already receives `getOrgKpiValue` or the org value lookup is available in its parent. Add the org achieved value as a prop when rendering `KpiJourneySection`.

Check how `KpiReviewPanel` gets org KPI data — it may need to be threaded from the scorecard.

#### Part 3: Thread from Scorecard → ReviewPanel → JourneySection

The `UnifiedScorecard` and `EmployeeScorecard` already compute `orgKpiValuesMap`. When they render `KpiReviewPanel`, pass the resolved org achieved value for the selected KPI.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/KpiJourneySection.tsx` | Add `orgAchievedValue` prop; use as fallback for Self stage achieved value |
| `src/components/review/KpiReviewPanel.tsx` | Accept and forward `orgAchievedValue` prop to `KpiJourneySection` |
| `src/components/review/UnifiedScorecard.tsx` | Pass resolved org achieved value to `KpiReviewPanel` |
| `src/components/review/EmployeeScorecard.tsx` | Pass resolved org achieved value to `KpiReviewPanel` |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Display-only fix, no schema or RLS changes.
- **No regression**: Additive fallback — if `submission?.achieved_value` exists, it takes priority.
- **Immediate fix**: All org KPIs currently at `kra_set` with entered data will immediately show achieved values in the Journey.




# Fix: N/A Override at Any Review Stage

## Problem

When a KPI is marked as "Not Applicable" (N/A) at any stage (e.g., Self Review), all subsequent reviewers are forced to only "Confirm N/A" -- they cannot override it and provide an actual score. The current behavior treats N/A as a permanent, irreversible state once set.

**What the user expects:**
- N/A marked at one stage should NOT force N/A at all subsequent stages
- Each reviewer should independently decide whether the KPI is truly N/A or deserves a score
- The last stage's decision (N/A or scored) should be final

## Root Cause (4 blocking points)

| # | Location | Issue |
|---|---|---|
| 1 | `KpiDetailsTable.tsx` line 129-130 | `canReviewKpiCheck` returns `false` for N/A KPIs, hiding the Review button entirely |
| 2 | `UnifiedScorecard.tsx` line 1008 | When `is_na === true`, only the "Confirm N/A" card is shown -- no score input, no override option |
| 3 | `UnifiedScorecard.tsx` line 664 | `handleSubmitReview` short-circuits for N/A KPIs: only allows confirmation, no score submission path |
| 4 | `NaConfirmationCard.tsx` | The "confirm existing N/A" variant has no toggle to override/reverse the N/A decision |

## Solution

### 1. Allow reviewers to review N/A KPIs (KpiDetailsTable)

Remove the `if (isNaKpi) return false` guard from `canReviewKpiCheck`. N/A KPIs should still be reviewable -- the reviewer decides whether to confirm or override.

### 2. Add "Override N/A" option to NaConfirmationCard

Enhance the existing N/A confirmation card with a new toggle: **"Override: This KPI is applicable"**. When toggled on:
- The confirmation checkbox is hidden
- A mandatory justification field appears
- The parent component is notified via a new `onOverrideNa` callback
- Score input fields become visible in the review sheet

### 3. Update review sheet rendering (UnifiedScorecard)

When a KPI has `is_na === true` and the reviewer is at a reviewable stage:
- Show the enhanced NaConfirmationCard (with override option)
- If the reviewer chooses to override, show the standard score input (AchievedValueScoreInput, remarks, evidence)
- If the reviewer confirms N/A, keep current behavior

### 4. Update submit logic (handleSubmitReview)

Add a new code path for N/A override:
- Set `is_na = false` and `na_marked_by_role = null` on the submission
- Submit the reviewer's score, rating, and remarks normally
- Log an audit entry (`{ROLE}_NA_OVERRIDDEN`)
- Advance status as usual

### 5. Update score calculations

In `scoreData` calculation (line 323), N/A exclusion already uses `submission?.is_na` which will be `false` after override -- no change needed here.

### 6. Update legacy scorecards (EmployeeScorecard, AuditScorecard, ManagementScorecard)

Apply the same override logic to legacy scorecard components that also have N/A confirmation flows, ensuring consistency across all review paths.

## Detailed File Changes

| File | Change |
|---|---|
| `src/components/review/NaConfirmationCard.tsx` | Add `onOverrideNa` callback prop, add "Override N/A" toggle with mandatory justification, add `naOverridden` / `overrideRemarks` state props |
| `src/components/review/KpiDetailsTable.tsx` | Remove `if (isNaKpi) return false` from `canReviewKpiCheck` (line 130) |
| `src/components/review/UnifiedScorecard.tsx` | (a) Add `naOverridden` + `overrideNaRemarks` state variables; (b) Show score inputs when `naOverridden === true`; (c) Add override submit path in `handleSubmitReview` that clears `is_na` and submits score; (d) Reset override state in `openReviewSheet` |
| `src/components/review/EmployeeScorecard.tsx` | Apply same override logic as UnifiedScorecard |
| `src/components/review/AuditScorecard.tsx` | Apply same override logic as UnifiedScorecard |
| `src/components/review/ManagementScorecard.tsx` | Apply same override logic as UnifiedScorecard |
| `DOCUMENTATION.md` | Document the N/A override behavior and per-stage independence |

## Expected Behavior After Fix

```text
Stage Flow Example:
1. Employee marks KPI as N/A (is_na = true, na_marked_by_role = 'employee')
2. Manager opens KPI -- sees "This KPI was marked as N/A (by Self)"
   Option A: Confirm N/A --> forwards with is_na = true (current behavior)
   Option B: Toggle "Override: This KPI is applicable" --> provide score --> forwards with is_na = false
3. Next reviewer (Skip-Level/Auditor/etc.) sees it as a scored KPI (if overridden) or N/A (if confirmed)
4. Any later stage can also re-mark it as N/A using the existing "Mark as N/A" toggle
5. The LAST stage's decision is what sticks as final
```

## Risk Assessment

- Low risk -- no database schema changes required
- `is_na` and `na_marked_by_role` columns already exist and are nullable
- Backward compatible -- default behavior (confirm N/A) remains unchanged; override is opt-in
- Score calculation engine already handles the `is_na` flag dynamically, so overriding it immediately includes the KPI in weighted calculations
- Audit trail captures every N/A mark and override for compliance


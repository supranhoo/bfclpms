
# KPI Score Calculation Bug: Inherited Score Not Recalculated from Achieved Value

## Root Cause Analysis

The screenshot shows:
- **Self**: Value 91.36, Rating **4** (correct: 91.36 ≤ 95 → R4)
- **Manager**: Value 98, Rating **3** (correct: 98 ≤ 100 → R3)
- **Skip-Level**: Value 91.36, Rating **3** (WRONG: 91.36 ≤ 95 → should be R4)
- **HR PMS**: Value 91.36, Rating **3** (WRONG: 91.36 ≤ 95 → should be R4)

The bug is in `UnifiedScorecard.tsx` → `openReviewSheet()` (lines 642-684).

When a reviewer opens a KPI sheet, the score is initialized by **inheriting the previous reviewer's score** rather than recalculating from the achieved value:

```typescript
// Line 650: Skip-level inherits manager's score (3) even though the achieved value (91.36) warrants a 4
skip_level: () => (existing as any)?.skip_level_score ?? existing?.manager_score ?? null,
```

The `AchievedValueScoreInput` component has auto-calculation logic, but it only fires when `score === null` (line 73):
```typescript
if (mode === 'auto_calculate' && score === null && achievedValue !== null ...)
```

Since the score is pre-populated to 3 (inherited), auto-calculation never triggers.

## Fix

### File: `src/components/review/UnifiedScorecard.tsx` (lines 642-684)

In `openReviewSheet()`, after determining the achieved value, if the reviewer's **own** score field is null (they haven't reviewed yet), recalculate the score from the achieved value using `calculateRating()` instead of blindly inheriting from the previous level.

**Logic change:**
1. Check if the reviewer's own score (`existing?.[prefix_score]`) is null
2. If null AND an achieved value is available AND thresholds exist → call `calculateRating()` to compute the correct score
3. Use the recalculated score instead of the inherited one

This ensures that when a reviewer opens a KPI for the first time, the displayed score matches the achieved value against thresholds, rather than inheriting a potentially incorrect score from a prior stage that used a different achieved value.

### File: `src/components/review/AchievedValueScoreInput.tsx` (line 73)

As a secondary safety net, also update the auto-calc effect to trigger recalculation when the current score doesn't match what the achieved value should produce — not just when score is null. This handles cases where the component receives a mismatched score/value pair.

## Risk Assessment
- **Data Impact**: No schema changes. Only affects future review sessions — already-saved scores are unaffected.
- **Regression Risk**: Low. The recalculation uses the same `calculateRating()` function already used everywhere. If the reviewer has already entered their own score, it's preserved (no recalculation).
- **Workflow Impact**: None. The fix is scoped to score initialization logic only.



# Fix: Forward Button Not Activating for Daily KPI at Reviewer Level

## Root Cause

The `openReviewSheet` function in `UnifiedScorecard.tsx` has a broken score initialization for the `skip_level` and `hr_pms` view levels. The `else` fallback branch incorrectly reads `management_score ?? auditor_score`, which are always `null` at those stages since those downstream reviewers haven't acted yet.

This means:
- `reviewerScore` is set to `null` on open
- The achieved value IS pre-populated correctly
- The auto-calculate-on-mount effect in `AchievedValueScoreInput` should set the score, but can miss due to React state batching timing (the effect fires before both props have settled)
- The Forward/Submit button remains disabled (`reviewerScore === null`)
- Deleting and re-entering the value triggers `handleAchievedValueChange`, which explicitly calls `onScoreChange` -- fixing the score and enabling the button

## Fix

### File: `src/components/review/UnifiedScorecard.tsx`

**Change 1: Fix score initialization in `openReviewSheet` (lines 582-589)**

Replace the hardcoded if/else with proper per-level lookups:

```text
Before:
  if (viewLevel === 'manager')     -> manager_score
  else if (viewLevel === 'auditor') -> auditor_score ?? manager_score
  else                              -> management_score ?? auditor_score   <-- BUG

After:
  manager     -> manager_score
  skip_level  -> skip_level_score ?? manager_score
  hr_pms      -> hr_pms_score ?? skip_level_score
  auditor     -> auditor_score ?? manager_score (unchanged)
  management  -> management_score ?? auditor_score (unchanged)
```

**Change 2: Make auto-calculate-on-mount more robust in `AchievedValueScoreInput.tsx`**

Add a small safety mechanism: also trigger auto-calculation when the `achievedValue` prop changes (not just on mount), ensuring the score gets set even if there's a timing issue with initial render.

### File: `DOCUMENTATION.md`

Update changelog with the bug fix.

## Technical Detail

The fix replaces 3 lines of if/else with a clean per-level lookup:

```typescript
const scoreFieldMap: Record<ScorecardViewLevel, () => number | null> = {
  manager: () => existing?.manager_score ?? null,
  skip_level: () => (existing as any)?.skip_level_score ?? existing?.manager_score ?? null,
  hr_pms: () => (existing as any)?.hr_pms_score ?? (existing as any)?.skip_level_score ?? null,
  auditor: () => existing?.auditor_score ?? existing?.manager_score ?? null,
  management: () => existing?.management_score ?? existing?.auditor_score ?? null,
};
const prevScore = scoreFieldMap[viewLevel]();
```

For the auto-calculate robustness, the existing effect condition `score === null && achievedValue !== null` is correct but can miss due to batched renders. Adding a secondary check that re-triggers when `achievedValue` changes (even if score was briefly non-null then reset) ensures the score always gets populated.

## Files to Change

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Fix per-level score initialization in `openReviewSheet` |
| `src/components/review/AchievedValueScoreInput.tsx` | Make auto-calculate more robust for prop timing |
| `DOCUMENTATION.md` | Document the bug fix |


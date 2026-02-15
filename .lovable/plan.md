

# RCA and CAPA: Approve Button Requires Re-entering Value

## Root Cause Analysis (RCA)

### Problem Statement
When a reviewer opens a KPI for assessment, the Approve/Forward button stays disabled even though the Achieved Value is pre-populated from the previous review stage. The button only activates after the user manually re-enters the value.

### Root Cause: Two Defects Working Together

**Defect 1 -- Score not auto-calculated on mount (Primary Cause)**

The `AchievedValueScoreInput` component only triggers score calculation inside its `onChange` handler (`handleAchievedValueChange`). When the sheet opens with a pre-populated achieved value, no `onChange` event fires, so:

1. Sheet opens -> `achievedValue` is set to (e.g.) `85` from previous stage
2. `score` remains `null` because no calculation runs on initial render
3. Approve button checks `reviewerScore === null` -> stays **disabled**
4. User re-types the value -> `onChange` fires -> score is calculated -> button activates

This affects ALL review levels in `auto_calculate` mode (the most common scoring configuration).

**Defect 2 -- Falsy zero bug (Secondary)**

Score initialization uses the `||` operator which treats `0` as falsy:

```text
setManagerScore(existing?.manager_score || null);     // score=0 becomes null
setAuditorScore(existing?.auditor_score || null);     // score=0 becomes null
setManagementScore(existing?.management_score || null); // score=0 becomes null
```

A legitimate score of `0` ("Not Achieved") is silently discarded, making the Approve button disabled for the worst-performing KPIs.

### Affected Components (All 4 Scorecards)

| Component | Score Variable | Line |
|---|---|---|
| `EmployeeScorecard.tsx` | `managerScore` | Line 289 |
| `AuditScorecard.tsx` | `auditorScore` | Line 356 |
| `ManagementScorecard.tsx` | `managementScore` | Line 375 |
| `UnifiedScorecard.tsx` | `reviewerScore` | Line 574 |

### Impact
- Every reviewer at every level must re-enter the achieved value before they can approve
- Score of 0 is silently dropped, forcing re-entry for "Not Achieved" KPIs
- Significant friction in the review workflow across the entire organization

---

## Corrective and Preventive Actions (CAPA)

### Fix 1: Auto-calculate score on mount (AchievedValueScoreInput.tsx)

Add a `useEffect` that runs when the component mounts with a pre-populated achieved value but no score. This triggers the same calculation that `onChange` does, ensuring the Approve button is immediately enabled.

```text
// New useEffect in AchievedValueScoreInput.tsx
useEffect(() => {
  if (mode === 'auto_calculate' && score === null && achievedValue !== null && achievedValue !== '') {
    const numValue = typeof achievedValue === 'number' ? achievedValue : parseFloat(String(achievedValue));
    if (!isNaN(numValue)) {
      const result = calculateScoreFromValue(numValue);
      if (result) {
        onScoreChange(result.rating, result.ratingLevel);
      }
    }
  }
}, [achievedValue, score, mode]);
```

### Fix 2: Replace `||` with nullish coalescing `??` (All 4 Scorecards)

Change all score initialization from `|| null` to `?? null` to preserve zero values:

```text
// Before (broken for score=0):
setManagerScore(existing?.manager_score || null);

// After (correct):
setManagerScore(existing?.manager_score ?? null);
```

Apply to all 4 scorecard files and also fix `achievedValue` initializations that use the same pattern.

### Fix 3: Same fix for previousLevelScore in shared review components

```text
// AuditScorecard.tsx line 1085-1087 and ManagementScorecard.tsx line 1109-1111
// Change || to ?? for previousLevelScore calculation
```

---

## Files to Modify

| File | Change |
|---|---|
| `src/components/review/AchievedValueScoreInput.tsx` | Add useEffect to auto-calculate score on mount |
| `src/components/review/EmployeeScorecard.tsx` | Fix `\|\|` to `??` for score/achievedValue init |
| `src/components/review/AuditScorecard.tsx` | Fix `\|\|` to `??` for score/achievedValue init |
| `src/components/review/ManagementScorecard.tsx` | Fix `\|\|` to `??` for score/achievedValue init |
| `src/components/review/UnifiedScorecard.tsx` | Fix `\|\|` to `??` for score/achievedValue init |
| `DOCUMENTATION.md` | Document the fix and preventive measures |

## Preventive Measures
- The auto-calculation useEffect ensures this class of bug cannot recur regardless of how score state is initialized
- Switching to `??` across all scorecards prevents any future zero-value suppression
- Both fixes are backward-compatible and require no database changes

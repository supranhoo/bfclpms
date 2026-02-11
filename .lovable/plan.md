
# Rating and Weighted Score Mapping Audit

## Findings

### 1. Dashboard Score Fallback Chain is Incomplete (BUG)

In `src/pages/Dashboard.tsx` (line 203), the self-view score fallback skips intermediate review levels:

**Current (wrong):**
```
final_score ?? self_score ?? 0
```

**Should be (per system standard):**
```
final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score ?? 0
```

This means a KPI at `management_review` status (where manager and auditor have scored it) still shows only the self_score on the Dashboard, ignoring the more recent reviewer scores.

### 2. Data Inconsistency in Database

For "Ensure to process Salary by 3rd" (January 2026):
- `self_rating = green` but `self_score = 3.00`
- Green rating should map to score 4 (per ScoreSelector: green = 4)
- This was likely saved by a prior bug or manual entry. No code fix needed -- just a data note.

### 3. Weighted Score Display is Correct

The `UnifiedScorecard` correctly calculates: `totalWeightedScore = sum(score x weightage)` and displays it as `X / Y` where Y = totalWeight x 5. This is correct and consistent.

## Fix Plan

### File: `src/pages/Dashboard.tsx`

Update the score fallback chain in `singleMonthMetrics` (line 203) to match the system standard:

```typescript
// Before:
const score = submission?.final_score ?? submission?.self_score ?? 0;

// After:
const score = submission?.final_score 
  ?? submission?.management_score 
  ?? submission?.auditor_score 
  ?? submission?.manager_score 
  ?? submission?.self_score 
  ?? 0;
```

This ensures the Dashboard always uses the most authoritative score available, matching the UnifiedScorecard and report calculations.

### File: `DOCUMENTATION.md`

Document the corrected fallback chain.

## File Summary

| File | Action |
|---|---|
| `src/pages/Dashboard.tsx` | Fix score fallback chain (line 203) |
| `DOCUMENTATION.md` | Update docs |

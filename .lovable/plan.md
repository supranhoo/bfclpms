## Problem (Root Cause)

The badge currently reads `scoreData.totalWeight`, which inside `UnifiedScorecard.tsx` (lines 575–627) only accumulates weight for KPIs that have a **submission, are not N/A, and have a non-null score**:

```ts
if (submission && !submission.is_na) {
  const score = getRelevantScore(submission, kpi.status);
  if (score !== null && weight > 0) {
    totalWeight += weight;   // ← only scored KPIs counted
  }
}
```

So when KPIs are assigned but not yet scored (typical at the start of a month), the badge shows **0%** even though 100% weightage is assigned. This contradicts the requirement.

## Requirement Restated

The badge must reflect the **total weightage of all KPIs assigned in the month** (a sanity check that admins/KRA setup sums to 100%) — independent of whether scores have been entered. Goal: confirm the KRA mapping is complete.

## Fix

In `src/components/review/UnifiedScorecard.tsx`:

1. Compute a new field `assignedWeight` inside the `scoreData` useMemo that sums `kpi.weightage` for **every** KPI in `displayKpis` (skipping only those flagged `is_na = true`, since N/A KPIs are excluded from the 100% target per existing N/A Status Governance policy).
2. Return it alongside `totalWeight`.
3. Change the badge to read `Math.round(scoreData.assignedWeight)` instead of `scoreData.totalWeight`.
4. Update the tooltip wording: "Total weightage of all assigned KPIs this period. Should equal 100%. N/A KPIs are excluded."
5. Color rule unchanged: green at exactly 100, amber otherwise.

### Pseudocode change

```ts
let assignedWeight = 0;
displayKpis.forEach(kpi => {
  const submission = submissionMap.get(kpi.id);
  const isNA = submission?.is_na === true;
  if (!isNA) assignedWeight += (kpi.weightage || 0);
  // …existing scored-weight logic stays for overall rating calc
});
return { …, assignedWeight };
```

```tsx
({Math.round(scoreData.assignedWeight)}%)
```

## Why keep `totalWeight` separate

`totalWeight` is still required for the **overall rating** denominator (weighted average of scored KPIs). We only change what the **badge** displays — the rating math is untouched, preventing regression.

## Tests

Update `src/test/scorecard/categoryWeightageBadge.test.tsx`:
- 3 KPIs, weights 40/30/30, none scored → badge **100%** (green).
- 3 KPIs, weights 40/30/30, one marked `is_na` → badge **70%** (amber).
- Weights 40/30/20 (gap of 10), none scored → badge **90%** (amber).
- Weights 50/50, both scored → badge still **100%** (green).

## Risk & Impact

- **Data Impact:** None — purely a UI calculation change.
- **Workflow Impact:** None.
- **UI/UX:** Badge now correctly reflects assignment completeness; admins will immediately see KRA mapping gaps.
- **Regression Risk:** Low. Overall rating uses unchanged `totalWeight`; only the badge value/tooltip changes.
- **Mitigation:** Updated unit tests cover scored / unscored / N/A / partial-weight cases.

## Files to Edit

- `src/components/review/UnifiedScorecard.tsx` — add `assignedWeight`, swap badge source, update tooltip.
- `src/test/scorecard/categoryWeightageBadge.test.tsx` — replace existing assertions with the four cases above.

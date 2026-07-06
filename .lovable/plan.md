## Goal
Allow a template to allocate the full 100% weight to **System Scores** alone, making **Criteria** optional.

Today the editor forces two blockers:
- "Add at least one criterion before publishing."
- "Every criterion must have a weight greater than 0."

So even when System Scores already sum to 100, the user is forced to keep a dummy 1% Criteria row (as shown in the screenshot: "System 99% + Criteria 1% = 100%").

Runtime already supports this: `systemScoresFullyAllocated` in `src/lib/annualReview/templateVisibility.ts` hides the Criteria card when system weights sum to ≥100, and `shouldHideCriteriaCard` skips the criteria block on every reviewer stage.

## Change (single file)

**`src/components/annual-review/TemplateEditorDialog.tsx`** — relax activation blockers:

```ts
const systemFullyAllocated = Math.abs(systemWeight - 100) < 0.01;

if (!weightOk) activeBlockers.push(`Combined weight is ${combined}% (must be exactly 100%).`);
if (!rowsValid) activeBlockers.push('One or more weights are outside the 0–100 range.');
// Criteria only required when System Scores don't already cover 100%.
if (!systemFullyAllocated) {
  if (criteria.length === 0) activeBlockers.push('Add at least one criterion, or set System Scores to 100%.');
  else if (!criteriaHaveWeight) activeBlockers.push('Every criterion must have a weight greater than 0.');
}
```

Also update the weight-summary caption so a 100/0 split reads as valid: show `System 100% = 100% ✓ (Criteria optional)` when `systemFullyAllocated && criteria.length === 0`.

## UI impact
- With Carry KRA = 100 and no Criteria rows, "Activate" becomes enabled.
- Summary chip reflects the new valid state.
- Criteria card at runtime already hidden by `shouldHideCriteriaCard` — no reviewer-side change needed.

## Not changed
- Scoring engine, RLS, DB schema, services — untouched.
- Behaviour when System < 100 is identical to today (at least one weighted criterion still required).

## Tests
Add `src/test/annualReview/templateEditorSystem100.test.tsx`:
1. With one System Score at 100 and zero criteria → Activate button enabled, no "Add at least one criterion" blocker.
2. With System at 60 and zero criteria → blocker still present.
3. With System at 100 and a criterion at weight 0 → blocker still fires (combined ≠ 100 rule remains).

## Risk
Minimal — purely relaxes an editor-side gate; runtime already handles system-only templates.

## Issue Reported by Vivek Kumar Dansena

The screenshot shows the "Confirm propagation" dialog for an Org KPI:
- **Total matched: 8**, **0 will advance**, **8 will skip**
- All 8 employees show `self_review` status with reason "Already past initial stage"

After clicking **Propagate anyway**, the user gets a red destructive toast:
> "Partial propagation: 0/8 employees updated. 8 employee(s) may have mismatched KPI names. Check the Pending Report for details."

This message is **wrong and misleading**. The 8 employees do NOT have mismatched KPI names — they have all already self-reviewed (advanced past the data-owner `kra_set` stage). Per POLICY §88, re-propagation is intentionally blocked once an employee has self-reviewed. The earlier code path at `OrgKpiDataEntry.tsx:718-722` correctly identifies this as "Already propagated" (benign skip), but a second validation block at lines **732-739** then unconditionally fires the destructive "mismatched KPI names" toast whenever `totalPropagated < expectedCount`, ignoring the fact that all skips were benign (`not_in_kra_set`).

## Root Cause

`src/pages/admin/OrgKpiDataEntry.tsx` lines 732-739 — the PA3 "Propagation completeness validation" block:

```ts
if (propagatedScopeIds.length > 0 && expectedCount > 0 && totalPropagated < expectedCount) {
  toast({ title: `Partial propagation: ${totalPropagated}/${expectedCount} employees updated`,
          description: `${expectedCount - totalPropagated} employee(s) may have mismatched KPI names...`,
          variant: 'destructive' });
}
```

It does not consult `totalSkippedBenign` vs `totalSkippedHard`, so benign "already self-reviewed" skips get reported as KPI-name mismatches.

## Fix

1. **Make the PA3 validation skip-aware.** Only emit the destructive "mismatched KPI names" toast when `totalSkippedHard > 0` OR there is an unexplained gap (`expectedCount - totalPropagated - totalSkippedBenign - totalSkippedHard > 0`). When the entire shortfall is `not_in_kra_set` (benign), suppress this toast — the earlier "Already propagated" toast at lines 718-722 already informed the user correctly.

2. **Tighten the wording** when a true gap exists, distinguishing:
   - All benign → no destructive toast (info already shown).
   - Some hard skips → "Partial propagation: X updated, Y could not be advanced (refresh and retry)."
   - Truly unaccounted gap (rare) → keep the existing "may have mismatched KPI names" wording but only for the unaccounted count.

3. **Regression test** in `src/test/orgKpiPropagationToast.test.ts`: pure-logic test of the new branching predicate (inputs: propagated, expected, benign, hard → expected toast variant/title), guarding against regressions of this specific UX bug.

4. **Docs sync (per project SSOT rule):**
   - `DOCUMENTATION.md` Version History → "v2.66.10 — Skip-aware partial-propagation toast (no longer mislabels benign already-self-reviewed skips as KPI-name mismatches)."
   - `POLICY.md` §88.x → clarify that already-advanced KPIs are reported as benign, not as mismatches.
   - `CHANGELOG_2026.md` → entry under May W1.
   - `mem/features/admin/org-kpi-management-suite` → add bullet noting toast classification rules.

## Risk & Impact

- **Data Impact:** None. UI-only change to a toast branch.
- **Workflow Impact:** Eliminates a false-alarm destructive toast. Users will no longer be misdirected to the Pending Report for benign cases.
- **UI/UX:** Reduces noise. Existing "Already propagated" toast remains the canonical notice for this case.
- **Regression Risk:** Low. New unit test locks the branch table.

## Files Touched

- `src/pages/admin/OrgKpiDataEntry.tsx` (lines ~732-739 — replace block)
- `src/test/orgKpiPropagationToast.test.ts` (new, pure-logic)
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`
- `mem/features/admin/org-kpi-management-suite`

Approve to implement.

## Root cause (RCA)

Reproduced from the screenshot ("Partial propagation: 0/60 employees updated · 60 employee(s) may have mismatched KPI names"):

In `src/pages/admin/OrgKpiDataEntry.tsx`, `executeSaveAndPropagate` uses the **full mapped employee count** as the denominator for the propagation-completeness check, regardless of how many rows the user is actually propagating in this click:

```ts
// line 896
const expectedCount = employeeCountMap.get(kk) ?? 0;   // = 60 (all mapped)
…
// line 1037
if (consideredScopeIds.length > 0 && expectedCount > 0
    && totalPropagated < expectedCount) {
  …
  const unaccounted = Math.max(0, expectedCount - totalPropagated - accountedSkips);
  …
  toast({ title: `Partial propagation: ${totalPropagated}/${expectedCount} employees updated`,
          description: `${unaccounted} employee(s) may have mismatched KPI names…`,
          variant: 'destructive' });
}
```

But upstream, `OrgKpiEntryCard` deliberately ships **only the touched subset** into this handler (line 613-617: `touchedOnly = values.scopedValues.filter(s => s._touched)`). So when the admin uploads/edits 3 rows out of 60:

- The loop iterates 3 scopedValues → `consideredScopeIds.length = 3`.
- `expectedCount` is still 60.
- Even if all 3 succeed (or are validly skipped), `totalPropagated + accountedSkips ≤ 3 ≤ 60`, so `unaccounted = 57+` → red "mismatched KPI names" toast against employees that were never part of this submission.

The "0/60" further suggests the 3 attempted rows also returned `propagatedCount: 0` from the RPC (likely a separate workflow-stage skip), but the misleading 60-denominator amplifies it into an org-wide scare. There is no double-rule or schema regression — the completeness math is using the wrong denominator.

## Fix

Use the **attempted subset** as the denominator, not the full mapped population. The full-population guard is still useful, but only when the user is actually propagating the full set (no `filterEmployeeIds`, no touched-only subset).

### Code change (single file)

`src/pages/admin/OrgKpiDataEntry.tsx` — inside `executeSaveAndPropagate`:

1. Compute the **attempted count** = `values.scopedValues.length` after filter, with fallback to `expectedCount` only when nothing has been filtered.
2. Replace `expectedCount` in the completeness guard with this attempted count.
3. Update toast copy: `"Partial propagation: X/Y rows updated"` where Y is the attempted subset; keep the "mismatched KPI names" hint only when `unaccounted > 0` against the **attempted** subset (which is the real signal — a touched row whose name didn't resolve server-side).
4. Keep the existing half-propagation forward-guard at lines 1070+ (it already uses `propagatedScopeIds` vs `kpis` table query and is correctly scoped).

### Why this is safe

- `consideredScopeIds` already tracks exactly what this click attempted; we just stop comparing it to a population we never tried to touch.
- The benign/hard skip taxonomy and POLICY §88 lock paths are unchanged.
- No DB / RLS / RPC changes. No policy contradiction.
- The half-propagation forward-guard (lines 1070-1140) still catches genuine "kpis row exists for employee but propagate wasn't called" defects against the full mapped set.

## Risk & Impact Report

- **Data Impact:** None. Toast/copy only — no writes change.
- **Workflow Impact:** None. Skip logic, overwrite policy (ADR-064), POLICY §88 lock unchanged.
- **UI/UX:** The destructive toast stops firing falsely. When 3 of 3 attempted rows succeed, the success toast already at lines 996-1000 fires correctly. When 1 of 3 attempted rows genuinely mismatches, the destructive toast still fires — with the correct "1/3" denominator.
- **Regression Risk:** Low. Existing tests `orgKpiPropagationToast.test.ts` and `orgKpiPropagationBenignReasons.test.ts` lock the classifier; we'll extend with a "subset propagation" case.
- **Scalability:** Identical — no extra queries.

## Tests (added)

`src/test/orgKpiPropagationSubsetDenominator.test.ts` — pure-function tests on the classifier:

| Scenario | mapped | attempted | propagated | benign | hard | expected toast |
|---|---|---|---|---|---|---|
| Upload 3 of 60, all succeed | 60 | 3 | 3 | 0 | 0 | success |
| Upload 3 of 60, 1 benign skip | 60 | 3 | 2 | 1 | 0 | "already propagated" |
| Upload 3 of 60, 1 true mismatch | 60 | 3 | 2 | 0 | 0 | partial 2/3 mismatch |
| Upload 3 of 60, 1 hard skip | 60 | 3 | 2 | 0 | 1 | hard partial 2/3 |
| Propagate all 60, 57 untouched | 60 | 60 | 60 | 0 | 0 | success |

## DOCUMENTATION.md / POLICY.md

- POLICY.md → add §111.x: "Propagation completeness is measured against the **attempted subset** for this submission, not the full mapped population. Untouched rows are never counted as missing."
- DOCUMENTATION.md → update the "Propagation toast taxonomy" section with the new denominator rule and a worked example matching the screenshot.

## Out of scope (separate follow-ups)

- Investigating why the 3 attempted rows in the screenshot returned `propagatedCount: 0` with no skip reason surfaced. That is a server-side RPC visibility question and warrants its own RCA pass on `propagate_org_kpi_value` after the toast fix lands and we can read clean signals. I will flag it but not bundle it here.

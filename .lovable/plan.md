## Assumptions

- The user is on **Admin → Annual Review → Phased Rollout** (`PilotAccessCard`). "39 match(es) · 33 not yet in pilot" is the preview counter after selecting Assigned Template = `Generic M – (With KRA)` + `Generic W – (With KRA)`.
- The intent of the "Assigned Template" filter is: *show every active employee whose effective template for this cycle IS (or would be) one of the selected templates* — not just those already seeded to an instance.
- Active roster is ~2,533 employees (per `mem/architecture/profiles-query-policy`). The two "Generic (With KRA)" templates should legitimately return hundreds to low thousands, not 39.

## Risk & Impact Report

**Data Impact:** Read-only fix. No schema/RLS/data changes. The `admin_feature_flags.target_user_ids` write path (Add all / Add selected) is untouched.

**Workflow Impact:** Phased-rollout preview will now surface the true audience for a template; "Add all (N)" and "Remove template's users from phase" will operate on the correct N. No permission changes.

**UI/UX Impact:** Same layout. Counter and rows update to reflect the corrected list; pagination already in place handles the larger set.

**Regression Risk:** Low. Three narrow behaviour changes on one card:
1. `applyTemplateFilter` now unions seeded + rule-resolved template matches (was seeded-only).
2. `runPreview` pages profiles via `fetchAllPaged` (was `.limit(500)`).
3. `kpis` presence probe + `useAssignedForms` batch their `.in(...)` reads under the 1000-row cap.

**Mitigation:** Unit tests for the two new pure helpers; regression asserts on the source file for the paging pattern (matches existing `useMyVisibleEmployeeIdsPagination.test.ts` style).

## Root Cause

In `src/components/annual-review/PilotAccessCard.tsx`:

1. **`applyTemplateFilter` is seeded-only.** It calls `fetchEmployeeIdsForTemplates`, which reads `annual_review_instances` for the cycle and keeps only employees whose `COALESCE(template_override_id, template_id)` is in the selected set. Any employee who matches the mapping rules but hasn't been seeded yet is silently dropped — this is the direct cause of the "only a few employees" symptom during rollout, when most employees have no instance yet.
2. **`runPreview` truncates profiles.** `supabase.from('profiles').select(...).limit(500)` violates `mem/architecture/profiles-query-policy` (POLICY §94) — PostgREST also silently caps unranged reads at 1000. With 2,533 active employees, the candidate set is truncated before any filter runs.
3. **KRA presence probe is unpaged.** `.from('kpis').select('employee_id').in('employee_id', ids)` returns at most 1000 rows; with several KPIs per employee this drops the tail of `withKra`, misclassifying employees as "No KRA".
4. **`useAssignedForms` is unpaged.** Same 1000-row cap on `annual_review_instances`; large rollouts render `— not seeded` for real overrides.

## Plan

### 1. Fix template-filter semantics (correctness)

Replace `applyTemplateFilter`'s seeded-only intersection with a **rule-aware** allow-set:

- Fetch active `annual_review_assignment_rules` for the cycle + `deptToBu` map + any `has_kras`-window KRA sets (reuse `fetchEmployeesWithKrasSince`).
- For each preview candidate, compute `resolvedTemplateId = seededEffectiveTemplate ?? resolveTemplateForProfile(rules, profileForMatcher, deptToBu, krasSets).templateId`.
- Keep the row iff `resolvedTemplateId` is in the selected `template_ids`.
- The `runPreview` result needs `designation / pms_grade / level` (already on `profiles` for `MappingProfile`); extend the `select` list and `ProfileRow` interface. UI columns unchanged.

`fetchEmployeeIdsForTemplates` stays (still needed by `handleRemoveByTemplate`, whose scope is legitimately *current audience ∩ seeded template*), but is renamed to `fetchSeededEmployeeIdsForTemplates` for clarity.

### 2. Page every truncated read

- `runPreview`: wrap the `profiles` query in `fetchAllPaged` (drop `.limit(500)`); post-filter BU/dept as today.
- `runPreview`: chunk the KRA presence probe into ≤500-id batches and union the results (mirrors the pattern in `annualReviewService`).
- `useAssignedForms`: switch the `annual_review_instances` fetch to `fetchAllPaged` with the cycle filter; do the `employee_id` intersect client-side (avoids `.in()` cap on large audience unions).

### 3. Tests

- `src/test/pilotAccessCardTemplateFilter.test.ts` — pure unit test on the new resolver-aware allow-set helper: seeded-with-matching-template, seeded-with-different-template, unseeded-but-rule-matches, unseeded-and-unmapped. Reuses `resolveTemplateForProfile` mocks patterned on `formMapping.test.ts`.
- `src/test/pilotAccessCardPagination.test.ts` — source-level regression asserting `PilotAccessCard.tsx` uses `fetchAllPaged` for `profiles` + `annual_review_instances` and does NOT contain `.limit(500)` on `profiles`. Mirrors `useMyVisibleEmployeeIdsPagination.test.ts`.

### 4. Docs & Policy

- `DOCUMENTATION.md` → Phased Rollout section: document that the Assigned Template filter is **resolver-based** (seeded ∪ rule-predicted) and calls out the two 1000-row caps that were previously silently truncating the audience.
- `POLICY.md` §AR-PHASED-ROLLOUT: add "Preview audience is computed against the active mapping rules, so pre-seed employees are included."
- Version-history entry.

### Technical details

Files touched:

```
src/components/annual-review/PilotAccessCard.tsx      (fix + rename helper)
src/test/pilotAccessCardTemplateFilter.test.ts        (new)
src/test/pilotAccessCardPagination.test.ts            (new)
DOCUMENTATION.md                                       (Phased Rollout section)
POLICY.md                                              (§AR-PHASED-ROLLOUT note + version)
```

No SQL, no RPC, no edge-function, no schema, no RLS changes. Rollback = revert the single component file.

## UI Changes

- Same layout, same columns, same buttons.
- Filter-driven counter `N match(es) · M not yet in pilot` now reflects the resolver-based population; expect it to jump from 39 to the true count (hundreds to low thousands for the "With KRA" templates).
- `Add all (M)` label updates accordingly. Pagination controls already handle the larger set.

## Post-implementation notes

- Verification query (read-only) after deploy to confirm the new count matches admin expectations: compare `checkMappingCoverage(cycleId).rows` filtered by `resolvedTemplateId ∈ selected` against the UI counter.
- Not applicable: mock data changes (no new domain entities), edge-function updates.

## Root Cause
`hydrateSystemScoringRules` in `src/services/annualReview/cycleBulkDataUpload.ts` receives `templateById.values()` (a single-use `MapIterator`). The current code calls `Array.from(templates)` first — which exhausts the iterator — then loops over the now-empty `templates` iterator to build the `need` set. Result: `need` is empty, the function returns `[]` before hydrating anything from the KPI Library.

Consequences observed in the screenshots:
- Health strip falsely reports **8/8 linked** (unresolved list is empty because we never checked).
- Every template slot that depends on library hydration (LTI, STI, Unsafe Act, Departmental 5S, Trainings, Fugitive PM10) keeps empty `scoring_rules.bands`, so `parseAndDryRun` hits the per-cell "not linked to KPI Library" branch on every affected row.

## Fix (one line)
`src/services/annualReview/cycleBulkDataUpload.ts` — iterate the materialized array in both passes:

```ts
const templateList = Array.from(templates);
for (const t of templateList) {          // was: for (const t of templates)
  for (const s of t.sections.system_scores ?? []) {
    const src = (s as unknown as { source?: string }).source;
    if (src === 'carry_kra') continue;
    if (!s.scoring_rules || !s.scoring_rules.bands?.length) need.add(norm(s.name));
  }
}
```

## Risk & Impact
- **Data:** none — in-memory mutation only.
- **Workflow:** none — restores intended v2.66.91 behaviour.
- **UI:** health strip becomes truthful; per-cell "not linked" warnings vanish for slots the library actually covers; genuinely-unlinked slots are correctly surfaced.
- **Scalability:** none.
- **Regression:** low; guarded by a new iterator-exhaustion test.

## Tests
`src/test/annualReview/cycleBulkDataUploadHydration.test.ts` (new):
1. `__resolveScoringRulesForTests` mutates the template slot in place when the library has a matching `library_key`.
2. Unknown slot → returned in unresolved list with the correct template name.
3. **Regression lock** — call `hydrateSystemScoringRules` with a `Map.values()` MapIterator (mocking `supabase.from('annual_review_system_kpis')` with `vi.spyOn`) and assert the slot's `scoring_rules.bands` is populated. This would fail against today's code.

## Docs & Policy
- **DOCUMENTATION.md** — v2.66.97 entry: bulk-upload hydration iterator-exhaustion RCA + fix.
- **POLICY.md** — extend §AR-SYSTEM-KPI-LIBRARY-LINK: hydration MUST run against a materialized template list; the health-strip count MUST reflect actual hydration outcome, not a pre-return short-circuit.

## Rollback
Revert the one-line change in `cycleBulkDataUpload.ts` and delete the new test file. No schema, RLS, RPC, or data change.

## Not Applicable
- No UI structural change (existing strip and per-cell warnings simply become accurate).
- No new dependencies, migrations, edge functions, secrets, or pagination changes.

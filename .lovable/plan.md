# Fix — Annual Review Analytics & Calibration truncated at 1,000 employees

## Confirmed gap

Both the **Analytics** and **Calibration** tabs on `AnnualReviewAdmin` read the entire cycle roster through the same hook:

- `AnalyticsTab` (line 1491) → `useCycleInstances(activeCycle.id)`
- `CalibrationTab` (line 2471) → `useCycleInstances(activeCycle.id)`

`useCycleInstances` calls `svc.listInstancesForCycle` (`src/services/annualReview/annualReviewService.ts:432`):

```ts
db.from('annual_review_instances')
  .select('*, employee:profiles!...(...)')
  .eq('cycle_id', cycleId);   // ← no .range(), no paging
```

PostgREST silently caps this at **1,000 rows** (POLICY §94, §125, ADR-094). Current cycle has ~2,533 active employees, so Analytics buckets, stage funnel, on-time metrics, rating distribution, and the Calibration override table all silently drop >60% of the population. The Admin → Progress tab is unaffected (already uses `listInstancesPaginated`).

Downstream, `AnalyticsTab` also feeds these truncated IDs into `useInstanceStageScores`, so per-stage weighted scores are also computed off the wrong denominator.

## Risk & Impact

- **Data**: read-only; no schema change, no writes.
- **Workflow**: none — same UI, same behavior once rows load.
- **UI/UX**: Analytics/Calibration will now count the full roster; existing charts and tables render unchanged.
- **Regression**: `listInstancesForCycle` is also used elsewhere; must audit call sites to confirm they either want the full set (upgrade to paged) or already have their own bounds. Progress grid uses the paginated variant, so no conflict there.
- **Performance**: One cycle = ~2,533 rows × the embedded `profiles` projection. Paged fetch in 1,000-row chunks (~3 round-trips) on tab open, cached 30 s by React Query. Charts/loops are O(n) already and fine at 2.5k.
- **Mitigation**: reuse existing `fetchAllPaged` helper (same pattern as `seedInstancesByRules`, comprehensive report, `useMyVisibleEmployeeIds`, etc.), keep single-shot API for existing consumers, add a regression test.

## Plan

### 1. Add a paged fetcher in the service

`src/services/annualReview/annualReviewService.ts`

- Add `listAllInstancesForCycle(cycleId)` that wraps the current select with `fetchAllPaged<InstanceWithEmployee>((from, to) => db.from('annual_review_instances').select('*, employee:...').eq('cycle_id', cycleId).order('id').range(from, to))`.
- Keep `listInstancesForCycle` as a thin wrapper delegating to the paged version (so all existing callers get the fix automatically) — or rename and update call sites. Preferred: **delegate**, zero call-site churn.

### 2. No hook changes required

`useCycleInstances` will pick up the paged result transparently. Query key stays the same so cached data invalidates cleanly.

### 3. Audit sibling call sites

`rg 'listInstancesForCycle|useCycleInstances'` — confirm every caller genuinely wants the full roster (Analytics, Calibration, and any bulk ops). Anything that was implicitly limited to the first 1,000 by accident gets the correct full set.

### 4. Tests

`src/test/annualReview/cycleInstancesPaging.test.ts` — mirrors the existing `comprehensiveReportPaging.test.ts` / `seedInstances.paging.test.ts` pattern:

- Asserts `annualReviewService.ts` source contains `fetchAllPaged<` for the cycle-instances read and chains `.range(from, to)`.
- Asserts no bare `.from('annual_review_instances').select(...).eq('cycle_id',` remains without a `.range(...)`.
- Simulates a 2,533-row roster through `fetchAllPaged` and asserts row 1,500 and row 2,532 are both present.

### 5. Docs & memory

- Append DOCUMENTATION.md and POLICY.md changelog: "v2.66.x — Analytics & Calibration paged; POLICY §125 extended to `annual_review_instances` list reads."
- Update `mem/architecture/profiles-query-policy` compliant-sites list to add `listInstancesForCycle`.
- Add a short ADR: **ADR-135 — Annual Review cycle-instance reads must page (POLICY §125)**.

## Rollback

Single-file service change plus one test. Revert = restore the two-line select, no data implications.

## Technical details (files touched)

```text
src/services/annualReview/annualReviewService.ts   (paged fetcher)
src/test/annualReview/cycleInstancesPaging.test.ts (new regression test)
DOCUMENTATION.md, POLICY.md                         (changelog + §125 note)
docs/adr/ADR-135.md                                 (new ADR)
mem/architecture/profiles-query-policy              (append compliant site)
```

No migrations, no RPC changes, no UI changes.

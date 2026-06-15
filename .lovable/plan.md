## Root Cause

Both seed functions in `src/services/annualReview/annualReviewService.ts` read the active roster with an unranged

```ts
db.from('profiles').select(...).eq('is_active', true).eq('is_dummy_employee', false)
```

PostgREST silently caps that response at **1000 rows**, so with ~2,533 active employees the seeder only ever sees the first 1000 → "Seeded 1000 instances". This is exactly the bug class codified in **POLICY §94 / `mem://architecture/profiles-query-policy`** (must use `fetchAllPaged`).

The same risk exists for the in-function `departments.in('id', deptIds)` lookup once dept-id count exceeds 1000 (not the current symptom, but worth chunking).

## Risk & Impact

- **Data:** Currently 1,533 employees are silently missing from every cycle seed. No schema change; fix is read-side only. Upsert already uses `onConflict: 'employee_id,cycle_id'` so re-running after the fix safely top-ups missing instances without duplicating existing ones.
- **Workflow:** "Seed instances by rules" button behavior unchanged; just returns the true count.
- **UI:** None (toast text already dynamic).
- **Regression:** Low — change is isolated to two service functions. Existing upsert chunking (200) preserved.
- **Scalability:** `fetchAllPaged` walks at 1000/page with a 100-page safety cap (100k employees) — comfortably above the 2k+ headcount.
- **Rollback:** Single-file revert.

## Plan

1. **`src/services/annualReview/annualReviewService.ts`**
   - Import `fetchAllPaged` from `@/lib/fetchAll`.
   - In `seedInstancesForCycle`, replace the `profiles` read with:
     ```ts
     const people = await fetchAllPaged<any>((from, to) =>
       db.from('profiles')
         .select('id, reporting_manager_id, functional_manager_id')
         .eq('is_active', true).eq('is_dummy_employee', false)
         .order('id').range(from, to)
     );
     ```
   - Same pattern in `seedInstancesByRules` (with the wider column list it already uses).
   - Chunk the `departments.in('id', deptIds)` lookup at 500 ids/page (defensive; same class of bug).

2. **Re-seed after deploy** — user clicks "Seed instances by rules" again; upsert top-ups the missing ~1,533 rows without touching the existing 1000. Toast will then read e.g. `Seeded 2,533 instances`.

3. **Regression test** — add `src/test/annualReview/seedInstances.paging.test.ts` mirroring `employeePickerPaging.test.ts`: simulate a 2,533-row profile fetch through `fetchAllPaged`, assert full-roster coverage and that the 1000-row cap path would have missed employee #1500.

4. **Docs**
   - `src/modules/annual-review/DOCUMENTATION.md` — add a "Seeding pagination" note under Pagination contract.
   - `src/modules/annual-review/POLICY.md` — record that seeder MUST use `fetchAllPaged` per POLICY §94.
   - `mem://architecture/profiles-query-policy` — append `seedInstancesByRules` / `seedInstancesForCycle` to the compliant-sites list.

## Out of Scope

- Moving seeding to a SECURITY DEFINER RPC (would be the next step if RLS on `profiles` ever blocks paged reads for the HR/admin caller; not needed today since admins/HR can already read all active profiles).
- Per-employee template override UI (separate feature discussed earlier).

## Verification

- Manually re-run "Seed instances by rules" → toast should show the full active headcount (~2,533), not 1000.
- `SELECT count(*) FROM annual_review_instances WHERE cycle_id = '<id>'` matches active non-dummy roster count.
- New unit test passes.

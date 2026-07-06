## Diagnosis

The badges show `Total: 2579 · Seeded: 1000 · Will seed on start: 1579`. The `1000` is not real — it's PostgREST's default row cap. In `src/services/annualReview/formMapping.ts::checkMappingCoverage`, profiles are paged correctly, but `annual_review_instances` is read in a single unpaged query:

```ts
supabase
  .from('annual_review_instances')
  .select('id, employee_id, template_id, template_override_id')
  .eq('cycle_id', cycleId)
```

With a cycle that has >1000 instances, everything past row 1000 is dropped, so those employees fall through to `will_seed`. Same bug class as POLICY §94 / `seedInstances.paging.test.ts`.

## Fix (surgical)

1. `src/services/annualReview/formMapping.ts`
   - Replace the single `annual_review_instances` select inside `checkMappingCoverage` with a paged read using the existing `fetchAllPaged` helper from `@/lib/fetchAll` (1000/page, ordered by `id` for stable paging), matching the pattern already used by `fetchActiveProfiles` in the same file.
   - No shape/type/return changes; `byEmp` map builds from the full result.

2. Regression test — add `src/test/annualReview/formMappingCoverage.paging.test.ts`:
   - Mock `supabase.from('annual_review_instances')` to return two pages (1000 + N) and assert `checkMappingCoverage` counts all rows as seeded (not capped at 1000).
   - Mirrors the structure of `seedInstances.paging.test.ts`.

## Risk & Impact

- Data: read-only fix, no schema/RLS change.
- Workflow: none — Start Cycle logic already uses the correct seeder; only the coverage banner numbers were wrong.
- UI: badge counts now reflect reality (Seeded will jump from 1000 → actual; Will seed will drop accordingly).
- Regression risk: low, isolated to one query; locked by new test.
- Rollback: revert the one function.

## Not Applicable
Policy/DOCUMENTATION updates — no policy change; behaviour is being brought in line with existing §94 pagination policy.

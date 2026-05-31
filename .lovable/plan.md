## Root cause

The run does insert items correctly (verified in DB: 1 row exists for the latest run with `eligibility_status='no_score'`, `criteria_exempt=true`). The UI is empty because the React Query that powers both the **View** dialog and **Run Details** table uses an embedded PostgREST relationship that points at a foreign key which does not exist:

```ts
// src/hooks/useIncrementRuns.ts (useIncrementRunItems + useExportIncrementRunItems)
.select('*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code)')
```

DB check confirms the only FK on `public.increment_run_items` is `increment_run_items_run_id_fkey`. There is **no** `increment_run_items_employee_id_fkey`. PostgREST therefore fails relationship resolution and the query returns an error → `itemsData.rows = []` → "No items for this run." and the export comes back empty.

Secondary finding: `increment_runs`, `increment_run_items`, and `confirmation_increment_adjustments` have no explicit `GRANT`s to `authenticated` / `service_role` (only `sandbox_exec`). The runs list still renders today because admin paths reach the data, but this violates the project's GRANT-with-CREATE rule and is fragile.

## Risk & impact

- Data: additive only — add one FK constraint and three GRANT blocks. No row mutations. No RLS change.
- Workflow: none — purely fixes a read query that's already authorized via existing RLS.
- UI: View dialog and Run Details table populate; Export Excel returns rows.
- Regression: low. FK is additive; existing rows already satisfy it (employee_id values come from `profiles.id`). If any orphan exists, add via `NOT VALID` first.

## Plan

1. **Migration** `add increment_run_items employee FK + grants`:
   - `ALTER TABLE public.increment_run_items ADD CONSTRAINT increment_run_items_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;` then `VALIDATE CONSTRAINT` (safe rollback path if orphans exist).
   - Add missing grants on the three increment tables:
     ```sql
     GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_runs TO authenticated;
     GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_run_items TO authenticated;
     GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmation_increment_adjustments TO authenticated;
     GRANT ALL ON public.increment_runs, public.increment_run_items, public.confirmation_increment_adjustments TO service_role;
     ```
   - `NOTIFY pgrst, 'reload schema';` so PostgREST picks up the new relationship immediately.

2. **No code changes** to `useIncrementRuns.ts` — the existing embed string will resolve once the FK exists.

3. **Verify**:
   - Re-run the latest "View" — expect the criteria-exempt no-score row to appear.
   - Run Details table populates with Employee name + code.
   - Export Excel produces a non-empty file.

## Rollback

`ALTER TABLE public.increment_run_items DROP CONSTRAINT increment_run_items_employee_id_fkey;` — grants can be left in place (they only widen access already implied by RLS).

## Not applicable

Unit tests, mock data, policy doc — this is a schema-metadata fix with no business-logic change.

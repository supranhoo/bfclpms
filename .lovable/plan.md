## Risk & Impact Report

- **Data Impact:** No existing KPI data will be changed by the schema fix itself. The migration only corrects the resolver function contract so propagation can proceed.
- **Workflow Impact:** Org KPI propagation will resume for cross-department targets. Authorization remains admin or assigned Org KPI data owner only.
- **UI/UX Consistency:** No UI layout change. The existing toast should stop showing the backend structure mismatch.
- **Regression Risk:** Low-to-medium because the resolver feeds rating calculation; incorrect types can break propagation. The fix will lock the function return columns to the actual database column types.
- **Mitigation Plan:** Add a regression test that checks `resolve_org_kpi_target_kpis` return type matches the selected columns, especially `r5..r0` as text.

## Root Cause

The new `resolve_org_kpi_target_kpis` function declares `r5, r4, r3, r2, r1, r0` as `numeric`, but the live `kpis` table stores those columns as `text`.

Postgres requires every `RETURN QUERY` column to exactly match the declared `RETURNS TABLE` type. Because `k.r5` etc. are text but the function promises numeric, the function fails with:

```text
structure of query does not match function result type
```

This happens before the actual propagation RPC runs, so the remaining 10 rows are still not reached.

## Implementation Plan

1. **Database migration**
   - Replace `public.resolve_org_kpi_target_kpis(...)` with a corrected `RETURNS TABLE` signature:
     - `r5 text, r4 text, r3 text, r2 text, r1 text, r0 text`
   - Keep the same `SECURITY DEFINER` authorization logic.
   - Keep server-side target resolution across hidden departments.
   - Add explicit casts for ambiguous fields where useful so return shape stays stable.

2. **Frontend typing alignment**
   - No logic rewrite needed in `usePropagateOrgKpiValue.ts` because the rating calculator already consumes threshold values that can be text/numeric-like.
   - If generated types update automatically after migration, leave auto-generated files untouched.

3. **Regression protection**
   - Add/update a test confirming the resolver migration declares threshold columns as `text`, matching `kpis.r5..r0`.
   - Keep existing propagation result contract tests.

4. **Documentation/policy sync**
   - Update `POLICY.md` and `DOCUMENTATION.md` with the resolver contract: server-side Org KPI target resolution must match the live schema column types.
   - Update the Org KPI propagation memory to record this exact RCA so future changes do not reintroduce numeric threshold return types.

5. **Validation**
   - Re-check the live function definition after migration.
   - Optionally run the targeted Org KPI tests if build mode permits.

After approval, I’ll apply the migration and code/docs/test updates.
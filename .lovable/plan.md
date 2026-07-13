## Problem
The Results panel shows `column k.created_by does not exist`. The `public.kpis` table has no `created_by` column, but `get_first_kra_rollout` references `k.created_by` for the "who first rolled out" actor.

## Fix (surgical, single migration)
Replace the RPC `public.get_first_kra_rollout` so it derives the actor without touching `kpis.created_by`:

- Remove `k.created_by` from the `kpi_first` CTE (keep `first_at`, `period`, `year`).
- Add a new CTE `kpi_first_actor` that pulls the earliest `KPI_CREATED` performer per employee from `public.kpi_audit_logs`:
  ```sql
  kpi_first_actor AS (
    SELECT DISTINCT ON (k.employee_id)
      k.employee_id, a.performed_by AS first_by
    FROM public.kpi_audit_logs a
    JOIN public.kpis k ON k.id = a.kpi_id
    WHERE a.action = 'KPI_CREATED'
    ORDER BY k.employee_id, a.created_at ASC
  )
  ```
- Use `bundle.assigned_by` when source resolves to `bundle`, else `kpi_first_actor.first_by` (may be NULL for legacy rows — display as "—").
- No schema change, no frontend change, no policy change.

## Verification
- Re-open Admin → Reports → First KRA Rollout; the red error disappears and rows load.
- Search by employee code (e.g. `101785`) still filters correctly.
- Source filter (`bundle` / `rollover` / `manual`) still works.
- "Only employees without any KRA" toggle still lists new joiners with no KPIs.

## Out of scope
- No changes to safety RLS policies from the previous migration.
- No changes to the report UI, hook, or service layer.
- No changes to `kpis` schema.

## Risk
Low. Single RPC replacement via `CREATE OR REPLACE FUNCTION`; grants preserved. Rollback = re-run previous definition.
# Hotfix: `kpi_cell_detail` workflow resolution regression

## RCA

My previous migration rewrote `kpi_cell_detail` but replaced the original workflow lookup:

```sql
SELECT public.get_employee_workflow(p_emp_id, v_review_period, v_review_year)
  INTO v_workflow;
```

with a non-existent function call:

```sql
SELECT to_jsonb(w.*) INTO v_workflow
FROM public.resolve_employee_workflow(p_emp_id, v_review_period, v_review_year) w;
```

`public.resolve_employee_workflow(uuid,text,integer)` does not exist (only `get_employee_workflow`, `get_employee_workflow_info`, `get_bulk_employee_workflows`). Result: every detail-drawer / write-as-Manager open in Bulk Scoring throws `function ... does not exist`.

## Fix

Re-apply `kpi_cell_detail` identically to my last migration **except** restore the original workflow lookup using `get_employee_workflow` (returns JSONB). The category enrichment (`kra_categories` embed) is preserved.

```sql
-- workflow block
BEGIN
  SELECT public.get_employee_workflow(p_emp_id, v_review_period, v_review_year)
    INTO v_workflow;
EXCEPTION WHEN OTHERS THEN
  v_workflow := NULL;
END;
```

Wrap in `BEGIN/EXCEPTION` so future signature changes degrade gracefully (matches original resilience pattern).

## Risk & Impact

- Data: none.
- Workflow: restores prior working behavior + keeps category fix.
- Regression risk: minimal — calling the exact function that the original migration used.
- Tests: open detail drawer for any KPI in Bulk Scoring → no error; category badge renders correctly.

## Not in scope

Any other RPC changes.

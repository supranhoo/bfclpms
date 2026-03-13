

# Fix: Reconcile Orphaned KPIs — "column stages does not exist"

## Root Cause

The `reconcile_workflow_statuses` RPC contains this line:

```sql
SELECT stages INTO v_workflow_stages
FROM get_employee_workflow(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year);
```

`get_employee_workflow()` returns a **JSONB value directly** (the stages array), not a table/record with a `stages` column. The correct way to consume this is:

```sql
SELECT get_employee_workflow(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year)
INTO v_workflow_stages_jsonb;
```

Additionally, the result is JSONB (e.g., `["kra_set", "self_review", ...]`), but `v_workflow_stages` is declared as `TEXT[]`. We need to convert from JSONB array to `TEXT[]`.

## Fix (1 Migration)

Create a migration that replaces the `reconcile_workflow_statuses` function with a corrected version. The only change is in the workflow resolution line:

**Before:**
```sql
SELECT stages INTO v_workflow_stages
FROM get_employee_workflow(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year);
```

**After:**
```sql
SELECT ARRAY(
  SELECT jsonb_array_elements_text(
    get_employee_workflow(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year)
  )
) INTO v_workflow_stages;
```

This correctly calls the function, gets the JSONB result, and converts it to a `TEXT[]` for the subsequent array operations.

## Files Modified

1. **New SQL migration** — `CREATE OR REPLACE FUNCTION reconcile_workflow_statuses` with the corrected line

No frontend changes needed.


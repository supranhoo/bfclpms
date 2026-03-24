

## RCA: "Failed to reconcile workflow statuses" Error

### Root Cause

The error is a **PostgreSQL type casting failure**:

```
column "status" is of type review_status but expression is of type text
```

The `reconcile_workflow_statuses` function declares `v_new_status TEXT`, but the `kpis.status` column uses a custom enum type `review_status`. PostgreSQL does not implicitly cast `text → review_status`, so both UPDATE statements fail:

- Line ~187: `UPDATE kpis SET status = v_new_status ...` (for non-approved)
- Line ~181: `UPDATE kpis SET status = 'approved' ...` (this one works because string literals ARE implicitly cast, but `v_new_status` as a variable is not)

The dry run succeeds because it never hits the UPDATE path. The execute fails immediately on the first KPI it tries to update.

### Fix — One database migration

Add explicit `::review_status` casts to both UPDATE statements in the function:

```sql
-- Line for approved path:
UPDATE kpis SET status = 'approved'::review_status, updated_at = now() WHERE id = v_kpi.kpi_id;

-- Line for non-approved path:
UPDATE kpis SET status = v_new_status::review_status, updated_at = now() WHERE id = v_kpi.kpi_id;
```

The full `reconcile_workflow_statuses` function will be recreated with these two casts added. No other changes needed — the logic is correct, only the type casting was missing.

### Files
- DB migration only (recreate `reconcile_workflow_statuses` with `::review_status` casts)


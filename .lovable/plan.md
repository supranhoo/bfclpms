

# Fix: "invalid input value for enum kpi_status: approved"

## Root Cause

The `reconcile_workflow_statuses` RPC sets `kpi_status = 'approved'` on the `review_submissions` table, but the `kpi_status` enum only has these values:
- `open`
- `submitted`
- `approved_by_manager`
- `locked`

The value `'approved'` does not exist in the `kpi_status` enum — it exists in the separate `review_status` enum (used by `kpis.status`). The dry-run succeeds because it skips the UPDATE path entirely.

## Fix (1 Migration)

Replace the `reconcile_workflow_statuses` function, changing the single line:

```sql
-- Before:
kpi_status = 'approved',

-- After:
kpi_status = 'locked',
```

`locked` is the terminal/final state in the `kpi_status` enum for `review_submissions`, which aligns with a KPI being moved to `approved` status.

## Files Modified

1. **New SQL migration** — `CREATE OR REPLACE FUNCTION reconcile_workflow_statuses` with `kpi_status = 'locked'`

No frontend changes needed.


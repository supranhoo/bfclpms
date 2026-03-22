

## Completed: Fix kra_set → approved notification gap

The `notify_on_kpi_status_change` trigger's blanket early return for `kra_set → approved` has been removed, and `kra_set` added to the CASE 5 finalization condition. Admin fast-track approvals now generate `kpi_finalized` notifications with the final score.

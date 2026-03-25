

## Add Checkbox Selection to Reconciliation Dialog

### Problem
Currently, the reconciliation tool applies changes to ALL detected KPIs. The user wants the ability to select/deselect individual KPIs before executing.

### Approach

**Step 1: Update the DB function to accept a KPI ID filter**

Add an optional `p_kpi_ids UUID[]` parameter to `reconcile_workflow_statuses`. When provided (and not empty), only process KPIs whose IDs are in the array. When NULL/empty, process all (preserving current behavior).

**Step 2: Add checkbox UI to ReconcileOrphanedKpisDialog**

- Add a `selectedKpiIds` state (Set of strings), initialized to all KPI IDs after dry-run completes
- Add a "select all" checkbox in the table header
- Add per-row checkboxes
- Update the "Confirm & Reconcile" button to show selected count and pass `p_kpi_ids` to the execute call
- Disable the button when nothing is selected

### Files Changed
1. `supabase/migrations/` — new migration adding `p_kpi_ids` parameter to the function
2. `src/components/admin/ReconcileOrphanedKpisDialog.tsx` — checkbox state, select-all, per-row checkboxes, filtered execute call


## Bug — Auditor submission fails with `function resolve_employee_workflow(uuid, text, integer) does not exist`

### Root Cause (RCA)

The DB trigger `percolate_multimonth_score` (created in the v5 hardening migration that just shipped) calls a helper that was never created in the database:

```sql
SELECT workflow_template_id INTO v_terminal_wf_id
FROM resolve_employee_workflow(NEW.employee_id, NEW.review_period, NEW.review_year);
```

Confirmed via `pg_proc`: there is **no** `public.resolve_employee_workflow(...)`. The canonical helpers are `get_employee_workflow_info(uuid, text, integer)` (returns `TABLE(template_id uuid, …)`) and `get_employee_workflow(...)` (returns `jsonb`). Per `mem://architecture/database/per-employee-workflow-resolution`, `get_employee_workflow_info` / `get_bulk_employee_workflows` are the SSOT helpers — `resolve_employee_workflow` is a phantom name.

The same phantom call also exists in `repair_multimonth_workflow_drift_v5`.

**Why it surfaces now**: When the Auditor submits the terminal month of a Quarterly KPI and the row transitions to `approved`, the trigger fires, the missing function blows up the transaction, and the entire submit is rolled back → red toast "Failed to submit review …". This blocks every multi-month terminal-stage submission cluster-wide.

This is a Logic / SSOT-violation bug from the previous v5 patch — not a workflow data issue.

### Fix

1. **Migration `…_fix_percolate_resolve_workflow_call.sql`**
   - Replace the two phantom calls with the canonical helper:
     ```sql
     SELECT template_id INTO v_terminal_wf_id
     FROM get_employee_workflow_info(NEW.employee_id, NEW.review_period, NEW.review_year);
     ```
   - Wrap in a defensive guard so a NULL template never aborts the trigger:
     ```sql
     BEGIN
       SELECT template_id INTO v_terminal_wf_id
       FROM get_employee_workflow_info(...);
     EXCEPTION WHEN OTHERS THEN
       v_terminal_wf_id := NULL;
     END;
     ```
   - Apply the same fix inside `repair_multimonth_workflow_drift_v5`.
   - Re-create both functions with `CREATE OR REPLACE` (no schema change).

2. **Regression test** `src/test/multimonthPercolateResolveCall.test.ts`
   - Static assertion that no migration / function source contains the literal `resolve_employee_workflow(` (forbidden helper name).
   - Asserts the canonical helpers `get_employee_workflow_info` / `get_bulk_employee_workflows` are referenced instead.

3. **SSOT updates**
   - `POLICY.md` §54 → bump to v5.2: "Multi-month percolation MUST resolve terminal workflow via `get_employee_workflow_info`; `resolve_employee_workflow` is a forbidden phantom name."
   - `DOCUMENTATION.md` Version History entry.
   - `mem/architecture/database/per-employee-workflow-resolution` — append the phantom-name ban.

### Risk & Impact

- **Data**: None. Pure function-body fix; trigger logic and audit metadata unchanged.
- **Workflow**: Unblocks every Auditor / Mgmt submission on Bi-Monthly / Quarterly / Half-Yearly / Yearly terminals. Also unblocks the `MultimonthWorkflowDriftCard` repair tool.
- **UI/UX**: None.
- **Regression**: Low — same code path, just calls the correct function. Test guards against re-introduction.

### Files

- New: `supabase/migrations/<ts>_fix_percolate_resolve_workflow_call.sql`
- New: `src/test/multimonthPercolateResolveCall.test.ts`
- Edited: `POLICY.md`, `DOCUMENTATION.md`, `mem/architecture/database/per-employee-workflow-resolution`, `src/integrations/supabase/types.ts` (auto)

Approve to apply.
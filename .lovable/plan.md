

## RCA Fix: Multi-Month Score Percolation Bypass + Bulk Step-Back of Affected KPIs

### Problem
The `percolate_multimonth_score()` database trigger blindly approves sibling months when the terminal month is approved, bypassing all intermediate workflow stages (including audit). This caused ~51 KPIs to be forwarded and approved without auditor action.

### Policy Addition (Per User Direction)
- Quarterly, Bi-Monthly, Half-Yearly, and Yearly KPIs must complete the full workflow independently — the system must NOT auto-score or auto-approve sibling months
- System scores 0 only when self-review is overdue (not submitted by the 10th), per ADR-048. No other system-initiated scoring is permitted
- Score percolation copies scores only to siblings that have already independently reached their terminal workflow stage

### Data Impact: 40 Confirmed Percolated KPIs
Database query confirms **40 KPIs** currently in `approved` status with `SCORE_PERCOLATED` audit logs (2026). An additional ~11 were affected by `WORKFLOW_RECONCILED` actions — total aligns with the auditor's ~51 claim.

---

### Fix — 3 parts

#### Part 1: Database Migration — Fix the Trigger

Recreate `percolate_multimonth_score()` with a workflow-stage guard:

```sql
-- Before approving a sibling:
SELECT stages INTO v_sibling_stages
FROM get_employee_workflow_info(NEW.employee_id, v_sibling.review_period, NEW.review_year);

v_terminal := v_sibling_stages[array_length(v_sibling_stages, 1)];

IF v_sibling.kpi_status = 'approved' THEN
  -- Already approved: update scores only, no status change
ELSIF v_sibling.kpi_status = v_terminal THEN
  -- At terminal stage: safe to approve + copy scores
ELSE
  -- Mid-workflow: DO NOT touch, log PERCOLATION_DEFERRED
  CONTINUE;
END IF;
```

Key changes:
- Workflow guard checks sibling's terminal stage before approving
- Deferred percolation logged as `PERCOLATION_DEFERRED` in audit
- `auto_advance_reason` set to `'Score percolated from terminal month'` for traceability

#### Part 2: Database Migration — Bulk Step-Back All Percolated KPIs

A one-time migration to revert all system-percolated KPIs back to their correct pre-percolation workflow stage:

```sql
-- For each KPI with SCORE_PERCOLATED audit log that is currently approved:
-- 1. Look up the employee's workflow for that month
-- 2. Determine the stage the KPI was at BEFORE percolation (from audit log old_value)
-- 3. Step it back to that original stage
-- 4. Clear all review submission data from that stage onward (cascade-clear per ADR-033)
-- 5. Log ADMIN_BULK_STEP_BACK audit entry with reason "Reverting system percolation bypass"
```

Logic:
1. Query all KPIs where `kpi_audit_logs.action = 'SCORE_PERCOLATED'` AND `kpis.status = 'approved'`
2. For each, read the `old_value->>'status'` from the SCORE_PERCOLATED log — this is the stage before percolation
3. Reset `kpis.status` to that original stage
4. Clear review_submissions fields for that stage and all subsequent stages (same logic as `buildCascadeClearFields`)
5. Insert audit log: action = `ADMIN_BULK_STEP_BACK`, metadata includes `reason: 'Reverting system percolation — KPI must complete workflow independently'`

Additionally, check for KPIs affected by `WORKFLOW_RECONCILED` that were also system-advanced (the remaining ~11). If they are currently `approved` without legitimate reviewer action at their terminal stage, include them in the revert.

Estimated affected: **40-51 KPIs** across February, March, and April 2026.

#### Part 3: Documentation Updates

| File | Change |
|------|--------|
| `POLICY.md` | Add §51: Multi-month workflow independence + system scoring restriction |
| `docs/adr/ADR-047.md` | Amend with workflow guard requirement, note bulk revert |
| `DOCUMENTATION.md` | Version bump with RCA note |

### Risk Assessment
- **Bulk step-back**: KPIs will return to their pre-percolation stage. Employees/reviewers will need to re-process them through the workflow. No data loss — scores from the terminal month remain on the terminal month's KPI.
- **Trigger fix**: Forward-looking. Siblings stay at their current stage until reviewers complete. Terminal month approval no longer cascades.
- **Regression risk**: Low — additive guard in trigger, one-time migration for revert.


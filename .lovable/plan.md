## Carry-Forward Gap-Fill — Apr → Jun 2026

### Goal
For every employee that has at least one period-specific workflow override, copy the **most recent** override forward into **April, May, and June 2026** (rest of FY 2025-26), so the resolver returns the carried-forward template instead of falling back to Global.

Example (Ankit, 101785):
- Existing: Feb 2026 = `Self + L1 + HR PMS`, Mar 2026 = `Self + L1 + Audit`
- After fill: Apr / May / Jun 2026 = `Self + L1 + Audit` (carried from Mar)

### Scope
- 59 distinct employees that currently have at least one period-specific row in `workflow_config` (config_type = 'employee', review_period IS NOT NULL).
- Target months: April 2026, May 2026, June 2026.
- Per employee, for each target month, look up the latest existing override with (year, month_index) ≤ target. If found, insert a new row for the target month using that `workflow_template_id`.

### Mechanics

1. **Single migration** that runs once. SQL outline:

   ```text
   - Disable trg_workflow_change_step_back and trg_repercolate_on_workflow_config_change for the txn
   - WITH ranked AS (
       SELECT config_value, review_period, review_year, workflow_template_id,
              ROW_NUMBER() OVER (PARTITION BY config_value
                                 ORDER BY review_year DESC, month_index(review_period) DESC) AS rn
       FROM workflow_config
       WHERE config_type = 'employee' AND review_period IS NOT NULL
     )
     -- For each employee, take the most recent row that is ≤ target month
     -- and INSERT it for Apr / May / Jun 2026 if not already present.
   - Skip if a row already exists for (config_value, target_month, 2026) → no overwrite.
   - is_ongoing = false, performed_by = NULL (automated).
   - Re-enable triggers.
   ```

2. **Verification queries** (run inline after the migration):
   - Total inserted rows = 3 × (employees with ≥ 1 override) − any pre-existing matches.
   - Ankit (101785) Apr/May/Jun 2026 → `Self + L1 + Audit`.
   - Pick 5 random employees: confirm Apr-Jun 2026 row equals their latest pre-Apr override.
   - No employee without prior overrides should get new rows (Global stays Global).

3. **Reconcile statuses** for the three target months by calling `reconcile_workflow_statuses('April', 2026)`, `('May', 2026)`, `('June', 2026)`. This realigns any KPIs whose effective workflow changed.

### Risk & Impact

| Area | Impact | Mitigation |
|---|---|---|
| Data integrity | Adds ≤ 3 rows × 59 employees = up to 177 rows | `INSERT … ON CONFLICT DO NOTHING` on the unique key; idempotent. |
| Workflow status | Per-employee active stage may shift for Apr-Jun KPIs | `reconcile_workflow_statuses` run post-insert. |
| Audit trail | Each insert logged with `performed_by = NULL` (system) | Matches existing automated-action policy. |
| Regression | None — same path as the original PS restore | Triggers re-enabled at end of txn. |

### Out of scope
- Resolver carry-forward logic change (not requested; data fill makes it unnecessary).
- Rolling auto-fill cron (can be added next cycle if desired).
- Months beyond June 2026 — re-run a similar fill at fiscal rollover, or after the next workflow-config export contains explicit July+ rows.

### Deliverables on approval
1. One migration SQL doing the disable-triggers → insert → re-enable → reconcile flow.
2. Verification output: total inserted, Ankit row check, 5 random spot-checks.
3. Brief note added to `POLICY.md` under §134 explaining the carry-forward fill convention and the FY horizon rule.

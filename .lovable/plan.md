## Goal
Unassign the **Blue-Collar Comprehensive Review** template from all 2,403 mapped employees in the current active cycle (**Annual Review – 2025-2026**), keeping the template itself intact for future use.

## Current state (verified via DB)
- Cycle: `Annual Review - 2025-2026` (active)
- Template: `Blue-Collar Comprehensive Review`
- Assignment rules pointing to it: **1**
- Instances with `template_id` = this template: **2,403**
- Instances with `template_override_id` = this template: **0**
- Locked instances (status ≠ `not_started` / `pending_self`): **0** ✅ safe to clear

The UI count shows ~2,326 (active-only filter); DB has 2,403 total instances including inactive/exited employees. Both are handled below.

## Actions (single migration)

1. **Delete the assignment rule** for this template in the active cycle so re-seed cannot re-attach it.
   ```sql
   DELETE FROM annual_review_assignment_rules
   WHERE template_id = '<blue-collar-id>' AND cycle_id = '<active-cycle-id>';
   ```

2. **Delete the 2,403 instances** in the active cycle where `template_id` = Blue-Collar. All are in `not_started` / `pending_self`, so no in-flight review data is lost. This also clears any `template_override_id` on those rows.
   ```sql
   DELETE FROM annual_review_instances
   WHERE cycle_id = '<active-cycle-id>'
     AND template_id = '<blue-collar-id>'
     AND overall_status IN ('not_started','pending_self');
   ```
   Safety guard on `overall_status` prevents accidental deletion if anyone starts a self-review between now and migration execution.

3. **Audit log** entry in `system_audit_logs` recording action `annual_review.template_mapping_cleared` with counts.

## What is NOT touched
- `annual_review_templates` row (kept, ready for re-use).
- Any other cycle's rules/instances.
- Any responses (none exist since no instance is past `pending_self`).
- Other templates and their mappings.

## After migration runs
You can go to **Annual Review Admin → Rules** and add your new template's assignment rule, then click **Seed Instances** to map the new form to employees.

## Risk & rollback
- **Regression risk**: none — no submitted responses exist for these instances.
- **Rollback**: Re-add the rule and re-run `seedInstancesForCycle` — it rebuilds instances deterministically from rules + reviewer chain.

## Not applicable
- Code changes, UI changes, unit tests — this is a one-off data operation, not a feature change. `DOCUMENTATION.md` gets a one-line entry under Version History noting the mapping reset.

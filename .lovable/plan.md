## Request

Move these 10 employees to template **CPP - W - E** (`60854223-…`) and make sure each one can submit their Self review against the new template.

## Current state

All 10 are currently on **CPP - W - E&I** (`316a9249-…`). Nine are already at `pending_self` with no responses — a clean template swap. One (Shrawan Prajapati, 101133) has already submitted and locked his Self under E&I and is at `pending_dept` — he must also go back to Self.

| Emp code | Name | Status | Action |
|---|---|---|---|
| 100289 | Sandeep Thakur | pending_self (empty draft row) | Set override → CPP-W-E |
| 100290 | Mukesh Kumar | pending_self | Set override → CPP-W-E |
| 100635 | Ranjeet Kumar Sinha | pending_self | Set override → CPP-W-E |
| 100738 | Laxman Prajapati | pending_self | Set override → CPP-W-E |
| 100935 | Bhanu Pratap Singh | pending_self | Set override → CPP-W-E |
| 101218 | Safdar Ansari | pending_self | Set override → CPP-W-E |
| 101612 | Bimalesh Kumar Lal | pending_self | Set override → CPP-W-E |
| 101690 | Mohit Kumar | pending_self | Set override → CPP-W-E |
| 101698 | Sahil Ansari | pending_self | Set override → CPP-W-E |
| 101133 | Shrawan Prajapati | pending_dept (locked self) | Set override → CPP-W-E, unlock self, reset to `pending_self` |

Sandeep Thakur (100289) has an empty draft self row (no `submitted_at`). It stays intact — he can just edit it under the new template.

## Plan

Single migration, transactional:

1. `UPDATE annual_review_instances SET template_override_id = '60854223-…', updated_at = now()` for all 10 instance IDs.
2. For Shrawan Prajapati only:
   - `UPDATE annual_review_responses SET is_locked = false, updated_at = now()` on his Self row.
   - `UPDATE annual_review_instances SET overall_status = 'pending_self', updated_at = now()`.
3. Insert one `system_audit_logs` row per instance — action `annual_review.template_override_assigned`, metadata: `{previous_template_id, new_template_id, previous_status, reason: 'Reassigned to CPP - W - E per HR request; self reopened where applicable'}`.

## Why `template_override_id` (not `template_id`)

Per the per-employee-template-override memory, `template_override_id` is the SSOT for per-employee overrides — it survives future seeder re-runs and keeps the original assigned-rule chain (`template_id`) intact for audit.

## Risk & Impact

- **Data**: Shrawan's existing self answers preserved (only unlocked). No score loss.
- **Workflow**: 1 dept-head queue item disappears; 10 self-review items reappear for the employees against the new template.
- **Regression**: None — no code changes, `template_override_id` is already respected everywhere via the resolver.
- **Rollback**: One `UPDATE ... SET template_override_id = NULL` on the 10 IDs; re-lock Shrawan's self and set his status back to `pending_dept`.

## Note on the truncated message

Your last sentence ("Also ensure that need to submit this from") appears cut off. I'm reading it as "ensure they can submit this from Self review", which the plan above handles. If you meant something else (e.g. submit-on-behalf/proxy), tell me and I'll extend the plan.

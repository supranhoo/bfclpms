## Goal (policy statement, per your ask)

Whenever an admin/HR maps a new template to an employee (or an audience) mid-cycle, **all** affected employees must end up on the new template. Employees still on `pending_self` are non-destructively overridden. Employees who already submitted (past `pending_self`) are archived + wiped + restarted at `pending_self` on the new template so they see and refill the blank new form. **No partial state, no per-row opt-in.**

Today the three template-change entry points make past-self opt-in (checkbox / separate button), which is how the current 19 CPP - W - Operation employees got stranded.

## Fix — make "sync everyone" the only path

### 1. `SyncAssignmentsDialog` (Form Mapping + Rules tab entry point)
- Collapse the two buttons into a single primary **"Sync all N employees to `<new template>`"** action.
- Table still lists everyone with their per-row action badge (`Will move` / `Will reset` — no checkboxes).
- When past-self count > 0, require:
  - Reason textarea (min 10 chars)
  - Type `RESET` gate (present the destructive summary — "X employees have already submitted; their responses will be archived and they will refill the new form")
- When past-self count == 0, no RESET gate needed; still audit-log reason (min 3 chars, reuse existing default).
- Submit runs both server calls in a single transaction-like sequence:
  1. `bulkReassignViaOverride` for eligible rows
  2. `bulkForceResetInstances` for past-self rows (same `new_template_id`)
  Aggregate results into one toast; partial failures reported per-row.
- Callers `AnnualReviewFormMapping.tsx` and `AnnualReviewAdmin.tsx` (Rules tab) drop their split `runSync` / `runForceReset` handlers and pass a single `onSyncAll(payload, reason)` handler.

### 2. Per-row "Change template" on Admin → Progress (`ChangeTemplateDialog`)
- Remove the `not_started / pending_self` gate on the dropdown item.
- When invoked on a past-self instance, the dialog shows the destructive warning + `RESET` typed gate and calls `bulkForceResetInstances([{instanceId,newTemplateId}], reason)` instead of `setTemplateOverride`.
- For not-started / pending_self it keeps the existing non-destructive path.
- The separate "Reset & reassign template" menu item I added earlier is folded back into "Change template" so admins see one action, not two.

### 3. `BulkTemplateAssignmentDialog` (CSV/XLSX)
- Stop skipping past-self rows in the client dry-run. Classify them as **"Will reset"** in the preview instead of **"Skip"**.
- Upload runs `bulkReassignViaOverride` for eligible + `bulkForceResetInstances` for past-self, both with the row's supplied reason (still min 10 chars when any past-self are present; the CSV template already collects a Reason column).

### 4. Backfill the 19 CPP - W - Operation employees still stranded

Once the code lands, HR reopens Form Mapping → CPP - W - Operation (Casual workers) rule → Save (or just re-open the sync dialog) → single button reassigns everyone. No SQL / no manual RPC calls required.

If you want, I can *separately* run the destructive backfill for the 19 codes I listed via the RPC now (with a reason string you approve) before the code change ships — say the word and I'll fire it.

## Tests
- New: `src/test/annualReview/syncAssignmentsDialog.behavior.test.tsx` — dialog with only-eligible / only-past-self / mixed conflicts; asserts submit button label + gate visibility, and asserts the combined handler is called with the right splits.
- Update: `resetAndReassignTemplateDialog.test.ts` → merge into `changeTemplateDialog.test.ts` after the two paths are unified.
- Update: `bulkSetTemplateOverrides.test.ts` and any bulk CSV tests to cover the past-self→reset classification.
- Regression: `bulkForceResetInstances.test.ts` (added in previous turn) — unchanged; still guards the RPC contract.

## Not changed
- Server RPCs (`set_annual_review_template_override`, `bulk_force_reset_annual_review_instances`) already enforce the correct gates (role, reason length, stage). No migration.
- `resolveTemplateId` SSOT unchanged.
- Auditing is preserved via the two existing RPCs (`annual_review.template_override_set` + `annual_review.instance_force_reset`).

## Risk
- Destructive-by-default is intentional per your stated policy but changes an existing safety gate. Mitigations: mandatory reason + `RESET` typed gate whenever past-self > 0, prominent red warning summary, per-row action visible in the table so admin sees exactly whose data will be wiped.
- Rollback: revert the SyncAssignmentsDialog + ChangeTemplateDialog + BulkTemplateAssignmentDialog edits. RPCs and data model untouched.

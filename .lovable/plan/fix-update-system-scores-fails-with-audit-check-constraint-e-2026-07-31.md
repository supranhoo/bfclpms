# Fix: "Update system scores" fails with audit check-constraint error

Saving an admin System Score correction fails at the very last step with
`new row for relation "annual_review_access_audit" violates check constraint "annual_review_access_audit_action_check"`.
Nothing is saved, because the whole call is rolled back.

## Root cause (verified)

The ADR-217 correction routine writes its audit entry with the action label
`system_scores.admin_edit`, but the audit table's allowed-action whitelist contains
`system_scores.admin_override` instead. The two labels were introduced in separate
migrations and never matched, so every save is rejected by the database.

Confirmed by reading both the live constraint definition and the live function body.

## 5 Why

1. Save fails — the audit insert is rejected.
2. Rejected — `action` value is not in the allowed list.
3. Not in the list — the function writes `system_scores.admin_edit`.
4. Mismatch — the constraint was extended with `system_scores.admin_override`.
5. Nobody caught it — no test exercises a real end-to-end save of the correction path.

## Fix

1. Migration:
   - Align the two: keep the whitelisted label `system_scores.admin_override` as canonical and update `admin_update_system_scores_raw` to write exactly that value.
   - Also add `system_scores.admin_edit` to the whitelist so any historical/other caller cannot break, and re-assert the constraint.
   - No data change, no schema change to existing columns; purely additive and reversible.
2. Regression guard: a small test asserting the action label constant used by the correction path is one of the whitelisted audit actions, so the pair can't drift again.

## Risk & impact

- Data: none beyond one extra audit row per save (previously blocked).
- Workflow: unchanged; no status transitions.
- UI: unchanged — the dialog simply succeeds and shows the success toast.
- Regression: minimal; the only behaviour changed is the audit label written.
- Rollback: revert the function to the prior body; the widened constraint is harmless.

## Documentation

- `docs/adr/ADR-217.md`: note the canonical audit action label.
- `POLICY.md` §AR-SYSTEM-SCORE-ADMIN-CORRECTION: state the audit action label explicitly.
- `DOCUMENTATION.md`: version-history entry.

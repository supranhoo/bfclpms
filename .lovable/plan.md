# Fix: "Failed to update user" when deactivating a reviewer (Biswajit, 100426)

## Verified root cause
Confirmed against the live database:

- `profiles` has an AFTER UPDATE OF `is_active` trigger `trg_alert_on_reviewer_deactivation`, which inserts an audit row with `action = 'reviewer_deactivated_orphan_risk'` whenever the deactivated user still owns pending annual-review stages or heads a BU/department.
- The CHECK constraint `annual_review_access_audit_action_check` allows 17 action values, and `reviewer_deactivated_orphan_risk` is **not** one of them.

So the audit insert fails, the whole profile UPDATE transaction aborts, and the UI shows
`new row for relation "annual_review_access_audit" violates check constraint`.

This only bites users who are still mapped as reviewers/heads — which is why most deactivations work.

## 5 Why
1. Update fails → audit insert violates CHECK.
2. Insert violates CHECK → trigger writes an action value not in the allowlist.
3. Value not in allowlist → the alert trigger was added later than the constraint and the allowlist was not extended in the same migration.
4. Not extended → no test/guard binds trigger action literals to the constraint allowlist.
5. No guard → audit action vocabulary has no single source of truth.

## Fix
1. **Migration (additive):** drop and recreate `annual_review_access_audit_action_check` with the existing 17 values **plus** `reviewer_deactivated_orphan_risk`. No data change, no column change; rollback = recreate the previous list.
2. **Regression guard:** a test that extracts every `action` literal inserted into `annual_review_access_audit` from function sources and asserts each is present in the constraint allowlist, so a future trigger can never re-open this class of bug.
3. **Governance:** new ADR (`ADR-299 — Audit action vocabulary must match the CHECK allowlist`) and a POLICY section, plus a DOCUMENTATION.md version-history entry.

## Risk & impact
- Data: additive constraint widening only; existing rows unaffected.
- Workflow: deactivating a reviewer now succeeds and correctly records the orphan-risk alert.
- UI/UX: no visual change; the error toast disappears.
- Regression risk: very low; the constraint is only widened.
- Rollback: single migration reverting the allowlist.

## Verification
1. Toggle Biswajit (100426) to inactive → save succeeds.
2. One `reviewer_deactivated_orphan_risk` row appears in `annual_review_access_audit` for that user.
3. Deactivating a user with no pending stages still writes no audit row and still succeeds.

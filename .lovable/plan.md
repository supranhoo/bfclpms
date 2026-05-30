## Root cause

The exclusion add fails with:
```
new row for relation "increment_eligibility_audit" violates check constraint "increment_eligibility_audit_action_check"
```

The audit trigger `log_increment_eligibility_exclusion_change` writes `action = 'exclusion_added'` / `'exclusion_removed'`, but the table's CHECK constraint only allows:
`create, modify, delete, activate, deactivate, submit, approve, reject, copy, publish`.

So every insert into `increment_eligibility_exclusions` is rolled back by the trigger.

## Fix (migration only — no app code change)

Single migration that:
1. `ALTER TABLE public.increment_eligibility_audit DROP CONSTRAINT increment_eligibility_audit_action_check;`
2. Re-add with the two new values appended:
   `create, modify, delete, activate, deactivate, submit, approve, reject, copy, publish, exclusion_added, exclusion_removed`.

No data backfill needed (no rows of those types exist yet — every prior attempt was rolled back).

## Risk & impact

- **Data**: Additive only — widens allowed values. Existing rows already satisfy the new constraint.
- **Workflow**: Unblocks the Excluded Employees Add/Remove flow. No other surfaces touched.
- **Regression**: None — the constraint only restricts inserts; widening it cannot break existing inserts.
- **Rollback**: Re-add the original CHECK (safe as long as no exclusion rows exist; they won't until this fix lands).

## Out of scope
- Refactoring the trigger
- Any UI change (the form is correct; the toast is just surfacing the DB error)
- Adding more audit action types beyond the two the trigger actually emits

Shall I proceed?
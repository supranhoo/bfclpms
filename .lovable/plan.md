

# Fix: Update Database Check Constraint for New Rule Types

## Problem
The `review_period_auto_rules` table has a check constraint (`review_period_auto_rules_rule_type_check`) that only allows these values:
- `deadline_passed`, `review_submitted`, `approval_complete`, `calibration_complete`

The two new rule types — `scheduled_lock` and `auto_advance_zero` — are rejected by this constraint, causing the "violates check constraint" error shown in the screenshot.

## Fix
Run a single database migration to drop the old constraint and add a new one that includes all 6 rule types.

```sql
ALTER TABLE public.review_period_auto_rules
  DROP CONSTRAINT review_period_auto_rules_rule_type_check;

ALTER TABLE public.review_period_auto_rules
  ADD CONSTRAINT review_period_auto_rules_rule_type_check
  CHECK (rule_type = ANY (ARRAY[
    'deadline_passed', 'review_submitted', 'approval_complete',
    'calibration_complete', 'scheduled_lock', 'auto_advance_zero'
  ]));
```

No code changes needed — the UI and edge function already handle these types correctly.


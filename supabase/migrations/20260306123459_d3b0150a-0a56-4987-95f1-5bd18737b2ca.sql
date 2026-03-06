ALTER TABLE public.review_period_auto_rules
  DROP CONSTRAINT review_period_auto_rules_rule_type_check;

ALTER TABLE public.review_period_auto_rules
  ADD CONSTRAINT review_period_auto_rules_rule_type_check
  CHECK (rule_type = ANY (ARRAY[
    'deadline_passed', 'review_submitted', 'approval_complete',
    'calibration_complete', 'scheduled_lock', 'auto_advance_zero'
  ]));
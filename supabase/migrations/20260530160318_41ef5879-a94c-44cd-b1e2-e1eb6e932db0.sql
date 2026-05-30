-- 1. Add missing FK so PostgREST can embed profile on increment_eligibility_exclusions
ALTER TABLE public.increment_eligibility_exclusions
  ADD CONSTRAINT increment_eligibility_exclusions_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Extend audit action enum to include 'revert_to_draft' for the new unlock action
ALTER TABLE public.increment_eligibility_audit
  DROP CONSTRAINT increment_eligibility_audit_action_check;

ALTER TABLE public.increment_eligibility_audit
  ADD CONSTRAINT increment_eligibility_audit_action_check
  CHECK (action = ANY (ARRAY[
    'create','modify','delete','activate','deactivate',
    'submit','approve','reject','copy','publish',
    'exclusion_added','exclusion_removed','revert_to_draft'
  ]));
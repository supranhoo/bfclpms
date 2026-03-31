
-- Step 1: Delete orphan rows that reference non-existent profiles
DELETE FROM public.employee_incentive_records
WHERE employee_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.employee_incentive_eligibility
WHERE employee_id NOT IN (SELECT id FROM public.profiles);

DELETE FROM public.incentive_score_revisions
WHERE employee_id NOT IN (SELECT id FROM public.profiles);

-- Step 2: Add foreign key constraints
ALTER TABLE public.employee_incentive_records
ADD CONSTRAINT employee_incentive_records_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.employee_incentive_eligibility
ADD CONSTRAINT employee_incentive_eligibility_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.incentive_score_revisions
ADD CONSTRAINT incentive_score_revisions_employee_id_fkey
FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

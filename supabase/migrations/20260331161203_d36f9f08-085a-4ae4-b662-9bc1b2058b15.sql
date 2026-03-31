
ALTER TABLE public.employee_incentive_records
ADD COLUMN payment_period text NOT NULL DEFAULT 'full';

ALTER TABLE public.employee_incentive_records
DROP CONSTRAINT employee_incentive_records_employee_id_review_period_review_key;

ALTER TABLE public.employee_incentive_records
ADD CONSTRAINT employee_incentive_records_emp_period_year_prog_payperiod_key
UNIQUE (employee_id, review_period, review_year, program_id, payment_period);

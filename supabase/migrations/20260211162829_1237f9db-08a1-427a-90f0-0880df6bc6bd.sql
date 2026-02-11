
-- 1. Create password_rollout_logs table
CREATE TABLE public.password_rollout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  employee_code text,
  full_name text,
  email text,
  generated_by uuid REFERENCES public.profiles(id) NOT NULL,
  email_sent boolean DEFAULT false,
  email_error text,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.password_rollout_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT
CREATE POLICY "Admins can view rollout logs"
  ON public.password_rollout_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only INSERT
CREATE POLICY "Admins can insert rollout logs"
  ON public.password_rollout_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Create eligible_login_users view
CREATE OR REPLACE VIEW public.eligible_login_users AS
WITH has_kras AS (
  SELECT DISTINCT employee_id AS id
  FROM public.kpis
),
is_manager AS (
  SELECT DISTINCT p.reporting_manager_id AS id
  FROM public.profiles p
  WHERE p.reporting_manager_id IS NOT NULL
    AND p.id IN (SELECT employee_id FROM public.kpis)
)
SELECT
  pr.id,
  pr.full_name,
  pr.email,
  pr.employee_code,
  pr.designation,
  pr.department_id,
  CASE
    WHEN hk.id IS NOT NULL AND im.id IS NOT NULL THEN 'both'
    WHEN hk.id IS NOT NULL THEN 'has_kras'
    ELSE 'reporting_manager'
  END AS eligibility_type
FROM public.profiles pr
LEFT JOIN has_kras hk ON hk.id = pr.id
LEFT JOIN is_manager im ON im.id = pr.id
WHERE hk.id IS NOT NULL OR im.id IS NOT NULL;

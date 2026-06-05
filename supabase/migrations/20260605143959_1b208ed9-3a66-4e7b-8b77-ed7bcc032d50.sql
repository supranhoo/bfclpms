CREATE TABLE public.client_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  account_code text NULL,
  effective_role text NULL,
  route text NULL,
  query text NULL,
  error_message text NULL,
  error_stack text NULL,
  component_stack text NULL,
  user_agent text NULL,
  viewport text NULL,
  app_build text NULL,
  last_rpc_name text NULL,
  last_rpc_status int NULL,
  time_since_mount_ms int NULL
);

GRANT SELECT, INSERT ON public.client_error_reports TO authenticated;
GRANT ALL ON public.client_error_reports TO service_role;

ALTER TABLE public.client_error_reports ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may insert their own crash row (or anonymous row when user_id is null)
CREATE POLICY "authenticated can insert own crash report"
ON public.client_error_reports
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Only admins and HR PMS may read
CREATE POLICY "admin and hr_pms can read crash reports"
ON public.client_error_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_pms'::app_role));

CREATE INDEX client_error_reports_created_at_idx ON public.client_error_reports (created_at DESC);
CREATE INDEX client_error_reports_account_code_idx ON public.client_error_reports (account_code);
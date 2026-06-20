
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS assisted_self_submission_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designated_proxy_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS submitted_via_proxy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_submission_id uuid;

CREATE TABLE IF NOT EXISTS public.annual_review_proxy_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proxy_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  proxy_role text NOT NULL,
  selfie_path text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  declaration_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arps_instance_idx ON public.annual_review_proxy_submissions(instance_id);
CREATE INDEX IF NOT EXISTS arps_employee_idx ON public.annual_review_proxy_submissions(employee_user_id);
CREATE INDEX IF NOT EXISTS arps_proxy_idx ON public.annual_review_proxy_submissions(proxy_user_id);

GRANT SELECT, INSERT ON public.annual_review_proxy_submissions TO authenticated;
GRANT ALL ON public.annual_review_proxy_submissions TO service_role;

ALTER TABLE public.annual_review_proxy_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_proxy_submit_annual_review(
  _instance_id uuid,
  _proxy_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_employee_id uuid;
  v_manager_id uuid;
  v_skip_id uuid;
  v_status text;
  v_employee_email text;
  v_employee_last_signin timestamptz;
  v_designated uuid;
BEGIN
  IF _proxy_user_id IS NULL OR _instance_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT assisted_self_submission_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN false;
  END IF;

  SELECT i.employee_id, i.manager_id, i.skip_id, i.overall_status::text
    INTO v_employee_id, v_manager_id, v_skip_id, v_status
  FROM public.annual_review_instances i
  WHERE i.id = _instance_id;

  IF v_employee_id IS NULL OR v_status <> 'pending_self' THEN
    RETURN false;
  END IF;

  SELECT p.email, u.last_sign_in_at, p.designated_proxy_user_id
    INTO v_employee_email, v_employee_last_signin, v_designated
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_employee_id;

  IF v_employee_email IS NOT NULL AND v_employee_last_signin IS NOT NULL THEN
    RETURN false;
  END IF;

  IF _proxy_user_id = v_manager_id
     OR _proxy_user_id = v_skip_id
     OR _proxy_user_id = v_designated
     OR public.has_role(_proxy_user_id, 'admin'::app_role)
     OR public.has_role(_proxy_user_id, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_proxy_submit_annual_review(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "arps_insert_eligible_proxy" ON public.annual_review_proxy_submissions;
CREATE POLICY "arps_insert_eligible_proxy"
  ON public.annual_review_proxy_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    proxy_user_id = auth.uid()
    AND public.can_proxy_submit_annual_review(instance_id, auth.uid())
  );

DROP POLICY IF EXISTS "arps_select_visible" ON public.annual_review_proxy_submissions;
CREATE POLICY "arps_select_visible"
  ON public.annual_review_proxy_submissions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = proxy_user_id
    OR auth.uid() = employee_user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = instance_id
        AND (i.manager_id = auth.uid() OR i.skip_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "proxy_selfies_insert" ON storage.objects;
CREATE POLICY "proxy_selfies_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proxy-selfies'
    AND public.can_proxy_submit_annual_review(
      (regexp_split_to_array(name, '/'))[1]::uuid,
      auth.uid()
    )
  );

DROP POLICY IF EXISTS "proxy_selfies_select" ON storage.objects;
CREATE POLICY "proxy_selfies_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'proxy-selfies'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'hr_pms'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.annual_review_instances i
        WHERE i.id::text = (regexp_split_to_array(name, '/'))[1]
          AND (i.manager_id = auth.uid() OR i.skip_id = auth.uid())
      )
    )
  );

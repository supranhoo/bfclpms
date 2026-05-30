
CREATE TABLE public.increment_eligibility_exclusions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.increment_eligibility_configs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  assessment_year TEXT NOT NULL,
  reason TEXT,
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT iee_unique_config_emp_year UNIQUE (config_id, employee_id, assessment_year)
);

CREATE INDEX idx_iee_config_year ON public.increment_eligibility_exclusions (config_id, assessment_year);
CREATE INDEX idx_iee_employee_year ON public.increment_eligibility_exclusions (employee_id, assessment_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_eligibility_exclusions TO authenticated;
GRANT ALL ON public.increment_eligibility_exclusions TO service_role;

ALTER TABLE public.increment_eligibility_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read exclusions"
  ON public.increment_eligibility_exclusions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS insert exclusions"
  ON public.increment_eligibility_exclusions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS delete exclusions"
  ON public.increment_eligibility_exclusions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

-- Audit trigger: write to increment_eligibility_audit on add/remove
CREATE OR REPLACE FUNCTION public.log_increment_eligibility_exclusion_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_emp_name TEXT;
  v_emp_code TEXT;
  v_payload JSONB;
  v_row RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'exclusion_added';
    v_row := NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'exclusion_removed';
    v_row := OLD;
  ELSE
    RETURN NULL;
  END IF;

  SELECT full_name, employee_code INTO v_emp_name, v_emp_code
  FROM public.profiles WHERE id = v_row.employee_id;

  v_payload := jsonb_build_object(
    'employee_id', v_row.employee_id,
    'employee_name', COALESCE(v_emp_name, ''),
    'employee_code', COALESCE(v_emp_code, ''),
    'assessment_year', v_row.assessment_year,
    'reason', v_row.reason
  );

  INSERT INTO public.increment_eligibility_audit (
    config_id, criterion_id, performed_by, action,
    previous_value, revised_value, assessment_year
  ) VALUES (
    v_row.config_id, NULL, auth.uid(), v_action,
    CASE WHEN TG_OP = 'DELETE' THEN v_payload ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' THEN v_payload ELSE NULL END,
    v_row.assessment_year
  );

  RETURN v_row;
END;
$$;

CREATE TRIGGER trg_iee_audit
  AFTER INSERT OR DELETE ON public.increment_eligibility_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.log_increment_eligibility_exclusion_change();

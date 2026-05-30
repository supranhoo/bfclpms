CREATE OR REPLACE FUNCTION public.log_increment_eligibility_criteria_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_prev   jsonb;
  v_new    jsonb;
  v_assessment_year text;
  v_company_ids uuid[];
  v_company_label text;
  v_len int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_prev := NULL; v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN v_action := 'deactivate';
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN v_action := 'activate';
    ELSE v_action := 'modify';
    END IF;
    v_prev := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSE
    v_action := 'delete'; v_prev := to_jsonb(OLD); v_new := NULL;
  END IF;

  SELECT c.assessment_year, c.company_id
    INTO v_assessment_year, v_company_ids
    FROM public.increment_eligibility_configs c
   WHERE c.id = COALESCE(NEW.config_id, OLD.config_id);

  v_len := COALESCE(array_length(v_company_ids, 1), 0);
  IF v_len = 0 THEN
    v_company_label := 'All Companies';
  ELSIF v_len = 1 THEN
    SELECT co.name INTO v_company_label
      FROM public.companies co WHERE co.id = v_company_ids[1];
  ELSE
    v_company_label := v_len || ' companies';
  END IF;

  INSERT INTO public.increment_eligibility_audit
    (config_id, criterion_id, performed_by, action,
     previous_value, revised_value, company_label, assessment_year)
  VALUES
    (COALESCE(NEW.config_id, OLD.config_id),
     COALESCE(NEW.id, OLD.id),
     auth.uid(), v_action, v_prev, v_new,
     v_company_label, v_assessment_year);

  RETURN COALESCE(NEW, OLD);
END;
$function$;
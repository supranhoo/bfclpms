CREATE OR REPLACE FUNCTION public.resolve_final_score_rule(p_employee_id uuid, p_template_id uuid, p_review_period text, p_review_year integer)
 RETURNS workflow_final_score_rules
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule public.workflow_final_score_rules;
  v_dept text;
  v_grade text;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.name, p.pms_grade
    INTO v_dept, v_grade
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
   WHERE p.id = p_employee_id;

  SELECT * INTO v_rule FROM public.workflow_final_score_rules
   WHERE is_active
     AND workflow_template_id = p_template_id
     AND scope_type = 'employee'
     AND scope_value = p_employee_id::text
     AND review_period = p_review_period
     AND review_year = p_review_year
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  IF v_dept IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.workflow_final_score_rules
     WHERE is_active
       AND workflow_template_id = p_template_id
       AND scope_type = 'department'
       AND scope_value = v_dept
       AND review_period = p_review_period
       AND review_year = p_review_year
     LIMIT 1;
    IF FOUND THEN RETURN v_rule; END IF;
  END IF;

  IF v_grade IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.workflow_final_score_rules
     WHERE is_active
       AND workflow_template_id = p_template_id
       AND scope_type = 'pms_grade'
       AND scope_value = v_grade
       AND review_period = p_review_period
       AND review_year = p_review_year
     LIMIT 1;
    IF FOUND THEN RETURN v_rule; END IF;
  END IF;

  SELECT * INTO v_rule FROM public.workflow_final_score_rules
   WHERE is_active
     AND workflow_template_id = p_template_id
     AND scope_type = 'template'
     AND (review_period IS NULL OR review_period = p_review_period)
     AND (review_year IS NULL OR review_year = p_review_year)
   ORDER BY (review_period IS NOT NULL) DESC, (review_year IS NOT NULL) DESC
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  RETURN NULL;
END;
$function$;
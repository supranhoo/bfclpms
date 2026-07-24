
CREATE OR REPLACE FUNCTION public.enforce_management_terminal_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_bu             boolean;
  v_has_dept           boolean;
  v_employee_is_bu     boolean;
  v_reports_to_mgmt    boolean := false;
  v_reports_to         uuid;
  v_resolved           uuid;
  v_stages             jsonb;
  v_resolver_seed      uuid;
BEGIN
  v_stages   := COALESCE(NEW.enabled_stages, '[]'::jsonb);
  v_has_bu   := v_stages ? 'bu_head';
  v_has_dept := v_stages ? 'dept_head';

  SELECT EXISTS (
    SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = NEW.employee_id
  ) INTO v_employee_is_bu;

  SELECT p.reporting_manager_id INTO v_reports_to
    FROM public.profiles p WHERE p.id = NEW.employee_id;

  IF v_reports_to IS NOT NULL AND v_reports_to <> NEW.employee_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles pm ON pm.id = ur.user_id
       WHERE ur.user_id = v_reports_to
         AND ur.role = 'management'
         AND pm.is_active = true
    ) INTO v_reports_to_mgmt;
  END IF;

  IF v_employee_is_bu THEN
    IF v_has_bu THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('bu_head'::text);
      NEW.enabled_stages := v_stages;
    END IF;
    NEW.bu_head_id := NULL;
    v_resolver_seed := NEW.employee_id;

  ELSIF v_reports_to_mgmt THEN
    IF v_has_bu OR v_has_dept THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem NOT IN (to_jsonb('bu_head'::text), to_jsonb('dept_head'::text));
      NEW.enabled_stages := v_stages;
    END IF;
    NEW.bu_head_id   := NULL;
    NEW.dept_head_id := NULL;
    NEW.skip_id      := NULL;
    NEW.management_id := v_reports_to;
    IF NOT (v_stages ? 'management') THEN
      NEW.enabled_stages := v_stages || jsonb_build_array('management');
    END IF;
    RETURN NEW;

  ELSIF v_has_bu AND NEW.bu_head_id IS NOT NULL THEN
    v_resolver_seed := NEW.bu_head_id;
  ELSE
    NEW.management_id := NULL;
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_management_reviewer(v_resolver_seed, NEW.employee_id);
  NEW.management_id := v_resolved;

  IF v_resolved IS NULL THEN
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
  ELSE
    IF NOT (v_stages ? 'management') THEN
      NEW.enabled_stages := v_stages || jsonb_build_array('management');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

WITH active_cycle AS (
  SELECT id FROM public.annual_review_cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
),
targets AS (
  SELECT i.id
  FROM public.annual_review_instances i
  JOIN public.profiles p ON p.id = i.employee_id
  WHERE i.cycle_id = (SELECT id FROM active_cycle)
    AND i.overall_status <> 'completed'
    AND p.reporting_manager_id IN (SELECT user_id FROM public.user_roles WHERE role = 'management')
    AND NOT EXISTS (SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = p.id)
    AND (i.enabled_stages ? 'dept_head' OR i.enabled_stages ? 'bu_head')
)
UPDATE public.annual_review_instances i
   SET updated_at = now(),
       overall_status = (CASE
         WHEN EXISTS (
           SELECT 1 FROM public.annual_review_responses r
            WHERE r.instance_id = i.id AND r.reviewer_role = 'self' AND r.is_locked = true
         ) THEN 'pending_management'
         ELSE 'pending_self'
       END)::public.annual_review_status
  FROM targets t
 WHERE i.id = t.id;

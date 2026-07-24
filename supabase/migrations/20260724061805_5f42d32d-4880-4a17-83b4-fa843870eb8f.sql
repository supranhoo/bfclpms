
-- 1. Patch the trigger to handle BU-Head employees resolving Management via their own manager.
CREATE OR REPLACE FUNCTION public.enforce_management_terminal_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_bu        boolean;
  v_employee_is_bu boolean;
  v_resolved      uuid;
  v_stages        jsonb;
  v_resolver_seed uuid;
BEGIN
  v_stages := COALESCE(NEW.enabled_stages, '[]'::jsonb);
  v_has_bu := v_stages ? 'bu_head';

  -- Detect BU-Head employees (they never carry a BU Head reviewer above themselves)
  SELECT EXISTS (
    SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = NEW.employee_id
  ) INTO v_employee_is_bu;

  -- For BU-Head employees: strip 'bu_head' stage, clear bu_head_id, and resolve Management
  -- through the employee's own reporting manager instead of any bu_head_id.
  IF v_employee_is_bu THEN
    IF v_has_bu THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO v_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('bu_head'::text);
      NEW.enabled_stages := v_stages;
    END IF;
    NEW.bu_head_id := NULL;
    v_resolver_seed := NEW.employee_id;
  ELSIF v_has_bu AND NEW.bu_head_id IS NOT NULL THEN
    v_resolver_seed := NEW.bu_head_id;
  ELSE
    -- No BU stage / no BU head → no management stage; keep column NULL.
    NEW.management_id := NULL;
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_management_reviewer(v_resolver_seed, NEW.employee_id);
  NEW.management_id := v_resolved;

  IF v_resolved IS NULL THEN
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO NEW.enabled_stages
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

-- 2. resolve_management_reviewer: also accept the employee themselves as the seed
--    (when the seed IS the BU head, walk up via their reporting manager).
CREATE OR REPLACE FUNCTION public.resolve_management_reviewer(p_bu_head_id uuid, p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reports_to uuid;
  v_result     uuid;
BEGIN
  IF p_bu_head_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.reporting_manager_id INTO v_reports_to
    FROM public.profiles p
   WHERE p.id = p_bu_head_id;

  IF v_reports_to IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = v_reports_to AND ur.role = 'management')
     AND EXISTS (SELECT 1 FROM public.profiles pm
                  WHERE pm.id = v_reports_to AND pm.is_active = true) THEN
    v_result := v_reports_to;
  ELSE
    SELECT ur.user_id INTO v_result
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'management'
       AND p.is_active = true
     ORDER BY p.employee_code NULLS LAST, ur.user_id
     LIMIT 1;
  END IF;

  -- Guard: resolver must not equal the employee under review
  IF v_result IS NOT NULL AND v_result = p_employee_id THEN
    RETURN NULL;
  END IF;

  RETURN v_result;
END;
$function$;

-- 3. Re-trigger the corrected logic on every existing instance where the employee
--    is a BU Head whose reporting manager holds the 'management' role. A no-op
--    UPDATE fires enforce_management_terminal_stage and stamps enabled_stages +
--    management_id atomically.
UPDATE public.annual_review_instances ari
   SET updated_at = now()
  FROM public.profiles p
 WHERE ari.employee_id = p.id
   AND p.is_active = true
   AND EXISTS (SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = p.id)
   AND (ari.management_id IS NULL OR NOT (ari.enabled_stages ? 'management') OR (ari.enabled_stages ? 'bu_head'));

-- 4. Audit trail
INSERT INTO public.annual_review_access_audit(actor_id, target_user_id, action, before, after, reason)
SELECT NULL, ari.employee_id, 'management_stage.backfilled_bulk',
       jsonb_build_object('note','pre-trigger-patch'),
       jsonb_build_object('instance_id', ari.id, 'enabled_stages', ari.enabled_stages, 'management_id', ari.management_id),
       'ADR-148/ADR-138 rollout: trigger fix so BU-Head employees resolve Management via their own reporting manager'
FROM public.annual_review_instances ari
JOIN public.profiles p ON p.id = ari.employee_id
WHERE EXISTS (SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = p.id)
  AND ari.management_id IS NOT NULL;

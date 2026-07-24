-- ADR-152 — Management stage guard: only stamp when reporting-manager is Management-role.
-- Removes the "any management user" fallback that was picking up the Dummy (001) placeholder
-- for BU Heads whose reporting-manager is not a Management-role user.
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

  -- Only accept an actual Management-role, active reporting manager.
  -- NO fallback to "first management user" (that was picking up the Dummy placeholder).
  IF v_reports_to IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = v_reports_to AND ur.role = 'management')
     AND EXISTS (SELECT 1 FROM public.profiles pm
                  WHERE pm.id = v_reports_to AND pm.is_active = true) THEN
    v_result := v_reports_to;
  ELSE
    v_result := NULL;
  END IF;

  -- Guard: resolver must not equal the employee under review.
  IF v_result IS NOT NULL AND v_result = p_employee_id THEN
    RETURN NULL;
  END IF;

  RETURN v_result;
END;
$function$;
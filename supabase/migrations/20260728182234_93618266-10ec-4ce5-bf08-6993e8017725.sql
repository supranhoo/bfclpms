
CREATE OR REPLACE FUNCTION public.tg_business_units_cascade_head_to_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    FOR r IN
      SELECT i.id AS instance_id, i.cycle_id, i.employee_id, i.bu_head_id AS old_id
        FROM public.annual_review_instances i
        JOIN public.profiles p ON p.id = i.employee_id
        JOIN public.departments d ON d.id = p.department_id
       WHERE d.business_unit_id = NEW.id
         AND i.overall_status NOT IN ('completed','excluded','pending_hr')
         AND (i.enabled_stages ? 'bu_head')
         AND COALESCE(i.has_admin_workflow_override, false) = false
         AND i.employee_id IS DISTINCT FROM NEW.head_user_id
    LOOP
      UPDATE public.annual_review_instances
         SET bu_head_id = NEW.head_user_id, updated_at = now()
       WHERE id = r.instance_id;

      INSERT INTO public.annual_review_reviewer_resync_audit(
        instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id, reason, source
      ) VALUES (
        r.instance_id, r.cycle_id, r.employee_id, 'bu_head',
        r.old_id, NEW.head_user_id, 'bu_head_cascade', 'business_units.head_user_id'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_cascade_bu_head_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    UPDATE public.annual_review_instances i
    SET bu_head_id = CASE
                       WHEN i.employee_id = NEW.head_user_id THEN NULL
                       ELSE NEW.head_user_id
                     END,
        enabled_stages = CASE
          WHEN i.employee_id = NEW.head_user_id THEN
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM jsonb_array_elements_text(i.enabled_stages) t(x)
             WHERE x NOT IN ('bu_head','hr'))
          WHEN c.default_enabled_stages::jsonb ? 'bu_head'
               AND NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id THEN
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM (SELECT DISTINCT y AS x FROM (
                     SELECT jsonb_array_elements_text(i.enabled_stages) y
                     UNION ALL SELECT 'bu_head'
                   ) u) t)
          ELSE i.enabled_stages
        END,
        overall_status = CASE
          WHEN NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id
               AND i.overall_status = 'pending_hr'
               AND NOT EXISTS (
                 SELECT 1 FROM public.annual_review_responses r
                 WHERE r.instance_id = i.id
                   AND r.reviewer_role = 'bu_head'::annual_reviewer_role
                   AND r.submitted_at IS NOT NULL
               )
          THEN 'pending_bu'::annual_review_status
          ELSE i.overall_status
        END,
        updated_at = now()
    FROM public.profiles e
    JOIN public.departments d ON d.id = e.department_id
    JOIN public.annual_review_cycles c ON c.status IN ('open','active')
    WHERE i.employee_id = e.id
      AND d.business_unit_id = NEW.id
      AND i.cycle_id = c.id
      AND COALESCE(i.has_admin_workflow_override, false) = false
      AND i.overall_status NOT IN ('completed','excluded');
  END IF;
  RETURN NEW;
END;
$function$;

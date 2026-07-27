CREATE OR REPLACE FUNCTION public.tg_business_units_cascade_head_to_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
END $function$;
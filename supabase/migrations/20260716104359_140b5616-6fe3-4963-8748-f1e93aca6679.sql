
CREATE OR REPLACE FUNCTION public.prevent_profile_hr_field_self_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Service role / no session: allow
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only guard self-edits
  IF v_uid IS DISTINCT FROM OLD.id THEN
    RETURN NEW;
  END IF;

  -- Admins and HR PMS may change anything
  IF public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'hr_pms'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status
     OR NEW.portal_access IS DISTINCT FROM OLD.portal_access
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id
     OR NEW.pms_grade IS DISTINCT FROM OLD.pms_grade
     OR NEW.level_id IS DISTINCT FROM OLD.level_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.confirmation_increment_granted IS DISTINCT FROM OLD.confirmation_increment_granted
  THEN
    RAISE EXCEPTION 'Employees cannot modify HR-controlled fields on their own profile. Contact HR/Admin.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_hr_field_self_edit ON public.profiles;
CREATE TRIGGER trg_prevent_profile_hr_field_self_edit
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_hr_field_self_edit();

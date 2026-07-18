
-- Guard: block non-admin users from mutating org/access-control columns on their own profile row.
-- Existing UPDATE policies (Users can update own profile / Users can update their own profile)
-- have no column restriction, so this trigger is the enforcement point. Admins/HR bypass.
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Server-side / no-auth callers (edge functions, triggers, migrations) are trusted.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins and HR PMS can change anything.
  IF public.has_role(v_caller, 'admin'::app_role)
     OR public.has_role(v_caller, 'hr_pms'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only enforce when the caller is editing THEIR OWN row via a self-update policy.
  -- Cross-row updates are already blocked by RLS.
  IF NEW.id <> v_caller THEN
    RETURN NEW;
  END IF;

  -- Reject any change to org-hierarchy / access-control columns.
  IF NEW.employee_code            IS DISTINCT FROM OLD.employee_code
  OR NEW.email                    IS DISTINCT FROM OLD.email
  OR NEW.designation              IS DISTINCT FROM OLD.designation
  OR NEW.department_id            IS DISTINCT FROM OLD.department_id
  OR NEW.reporting_manager_id     IS DISTINCT FROM OLD.reporting_manager_id
  OR NEW.functional_manager_id    IS DISTINCT FROM OLD.functional_manager_id
  OR NEW.designated_proxy_user_id IS DISTINCT FROM OLD.designated_proxy_user_id
  OR NEW.company_id               IS DISTINCT FROM OLD.company_id
  OR NEW.location_id              IS DISTINCT FROM OLD.location_id
  OR NEW.is_active                IS DISTINCT FROM OLD.is_active
  OR NEW.portal_access            IS DISTINCT FROM OLD.portal_access
  OR NEW.has_real_email           IS DISTINCT FROM OLD.has_real_email
  OR NEW.deactivated_at           IS DISTINCT FROM OLD.deactivated_at
  OR NEW.pms_grade                IS DISTINCT FROM OLD.pms_grade
  OR NEW.pms_grade_id             IS DISTINCT FROM OLD.pms_grade_id
  OR NEW.level                    IS DISTINCT FROM OLD.level
  OR NEW.level_id                 IS DISTINCT FROM OLD.level_id
  OR NEW.employee_category        IS DISTINCT FROM OLD.employee_category
  OR NEW.employment_status        IS DISTINCT FROM OLD.employment_status
  OR NEW.previous_employment_status IS DISTINCT FROM OLD.previous_employment_status
  OR NEW.confirmation_date        IS DISTINCT FROM OLD.confirmation_date
  OR NEW.confirmation_increment_granted IS DISTINCT FROM OLD.confirmation_increment_granted
  OR NEW.confirmation_increment_effective_date IS DISTINCT FROM OLD.confirmation_increment_effective_date
  OR NEW.group_doj                IS DISTINCT FROM OLD.group_doj
  OR NEW.doj                      IS DISTINCT FROM OLD.doj
  OR NEW.is_dummy_employee        IS DISTINCT FROM OLD.is_dummy_employee
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'You cannot modify organizational or access-control fields on your own profile.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_self_update_column_scope ON public.profiles;
CREATE TRIGGER trg_enforce_profile_self_update_column_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_self_update_column_scope();

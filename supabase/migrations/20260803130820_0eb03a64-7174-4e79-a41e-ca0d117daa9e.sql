DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND NOT ((_self_profile_locked_snapshot()).reporting_manager_id IS DISTINCT FROM reporting_manager_id)
  AND NOT ((_self_profile_locked_snapshot()).department_id IS DISTINCT FROM department_id)
  AND NOT ((_self_profile_locked_snapshot()).pms_grade IS DISTINCT FROM pms_grade)
  AND NOT ((_self_profile_locked_snapshot()).pms_grade_id IS DISTINCT FROM pms_grade_id)
  AND NOT ((_self_profile_locked_snapshot()).employee_category IS DISTINCT FROM employee_category)
  AND NOT ((_self_profile_locked_snapshot()).employment_status IS DISTINCT FROM employment_status)
  AND NOT ((_self_profile_locked_snapshot()).is_active IS DISTINCT FROM is_active)
  AND NOT ((_self_profile_locked_snapshot()).portal_access IS DISTINCT FROM portal_access)
  AND NOT ((_self_profile_locked_snapshot()).confirmation_increment_granted IS DISTINCT FROM confirmation_increment_granted)
  AND NOT ((_self_profile_locked_snapshot()).company_id IS DISTINCT FROM company_id)
  AND NOT ((_self_profile_locked_snapshot()).designation IS DISTINCT FROM designation)
  AND NOT ((_self_profile_locked_snapshot()).employee_code IS DISTINCT FROM employee_code)
  AND NOT ((_self_profile_locked_snapshot()).level_id IS DISTINCT FROM level_id)
  AND NOT ((_self_profile_locked_snapshot()).location_id IS DISTINCT FROM location_id)
  AND NOT ((_self_profile_locked_snapshot()).functional_manager_id IS DISTINCT FROM functional_manager_id)
  AND NOT ((_self_profile_locked_snapshot()).designated_proxy_user_id IS DISTINCT FROM designated_proxy_user_id)
);
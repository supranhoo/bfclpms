
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND NOT ((SELECT p.reporting_manager_id       FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM reporting_manager_id)
  AND NOT ((SELECT p.department_id              FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM department_id)
  AND NOT ((SELECT p.pms_grade                  FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM pms_grade)
  AND NOT ((SELECT p.employment_status          FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM employment_status)
  AND NOT ((SELECT p.is_active                  FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM is_active)
  AND NOT ((SELECT p.portal_access              FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM portal_access)
  AND NOT ((SELECT p.confirmation_increment_granted FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM confirmation_increment_granted)
  AND NOT ((SELECT p.company_id                 FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM company_id)
  -- Newly locked (privilege-escalation hardening):
  AND NOT ((SELECT p.designation                FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM designation)
  AND NOT ((SELECT p.employee_code              FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM employee_code)
  AND NOT ((SELECT p.level_id                   FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM level_id)
  AND NOT ((SELECT p.location_id                FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM location_id)
  AND NOT ((SELECT p.functional_manager_id      FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM functional_manager_id)
  AND NOT ((SELECT p.designated_proxy_user_id   FROM public.profiles p WHERE p.id = auth.uid()) IS DISTINCT FROM designated_proxy_user_id)
);

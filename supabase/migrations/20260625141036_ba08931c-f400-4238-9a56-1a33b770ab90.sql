
-- Drop the view that exposed auth.users
DROP VIEW IF EXISTS public.v_profile_identity_drift;

-- Recreate duplicates view as SECURITY INVOKER
DROP VIEW IF EXISTS public.v_profile_email_duplicates;
CREATE VIEW public.v_profile_email_duplicates
WITH (security_invoker = true) AS
SELECT lower(email) AS email_lc, count(*) AS profile_count,
       array_agg(employee_code ORDER BY employee_code) AS employee_codes,
       array_agg(full_name     ORDER BY employee_code) AS full_names
FROM public.profiles
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING count(*) > 1;

GRANT SELECT ON public.v_profile_email_duplicates TO authenticated, service_role;

-- Admin-only function for identity drift (replaces the dropped view)
CREATE OR REPLACE FUNCTION public.list_profile_identity_drift()
RETURNS TABLE (
  profile_id            uuid,
  auth_email            text,
  auth_employee_code    text,
  auth_full_name        text,
  profile_email         text,
  profile_employee_code text,
  profile_full_name     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'list_profile_identity_drift: admin role required';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.raw_user_meta_data->>'employee_code')::text,
    (u.raw_user_meta_data->>'full_name')::text,
    p.email::text,
    p.employee_code::text,
    p.full_name::text
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE (u.raw_user_meta_data->>'employee_code') IS NOT NULL
    AND (
          (u.raw_user_meta_data->>'employee_code') <> COALESCE(p.employee_code,'')
       OR lower(COALESCE(u.raw_user_meta_data->>'full_name','')) <> lower(COALESCE(p.full_name,''))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.list_profile_identity_drift() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_profile_identity_drift() TO authenticated, service_role;

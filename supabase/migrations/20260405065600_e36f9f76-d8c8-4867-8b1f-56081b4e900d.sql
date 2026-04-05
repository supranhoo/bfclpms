
CREATE OR REPLACE FUNCTION public.get_profiles_for_audit_display(p_user_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.email
  FROM profiles p
  WHERE p.id = ANY(p_user_ids);
$$;

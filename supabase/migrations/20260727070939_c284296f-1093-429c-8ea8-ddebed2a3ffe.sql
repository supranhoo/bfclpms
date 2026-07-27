DROP FUNCTION IF EXISTS public.dust_rating_to_level(numeric);

CREATE FUNCTION public.dust_rating_to_level(p_rating numeric)
RETURNS public.rating_level
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_rating IS NULL THEN NULL
    WHEN p_rating >= 5 THEN 'blue'
    WHEN p_rating >= 4 THEN 'green'
    WHEN p_rating >= 3 THEN 'yellow'
    ELSE 'red'
  END::public.rating_level
$$;

REVOKE ALL ON FUNCTION public.dust_rating_to_level(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dust_rating_to_level(numeric) TO authenticated, service_role;
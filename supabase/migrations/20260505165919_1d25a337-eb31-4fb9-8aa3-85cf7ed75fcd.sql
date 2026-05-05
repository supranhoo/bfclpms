CREATE OR REPLACE FUNCTION public.normalize_kpi_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p, ''), E'[\\s\\r\\n]+', ' ', 'g')));
$$;
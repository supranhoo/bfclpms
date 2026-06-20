DROP FUNCTION IF EXISTS public.resolve_bu_head(uuid);

CREATE FUNCTION public.resolve_bu_head(p_bu_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _division_id uuid;
  _division_name text;
  _winner uuid;
BEGIN
  SELECT bu.division_id, div.name
    INTO _division_id, _division_name
  FROM public.business_units bu
  LEFT JOIN public.divisions div ON div.id = bu.division_id
  WHERE bu.id = p_bu_id;

  WITH scope AS (
    SELECT p.id, p.reporting_manager_id, p.doj,
           COALESCE(l.name, p.level) AS lvl_name
    FROM public.profiles p
    JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu2 ON bu2.id = d.business_unit_id
    LEFT JOIN public.levels l ON l.id = p.level_id
    WHERE p.is_active = true
      AND (
        d.business_unit_id = p_bu_id
        OR (
          _division_id IS NOT NULL
          AND _division_name IS NOT NULL
          AND bu2.division_id = _division_id
          AND lower(d.name) = lower(_division_name)
        )
      )
  ),
  roots AS (
    SELECT s.*
    FROM scope s
    WHERE s.reporting_manager_id IS NULL
       OR s.reporting_manager_id NOT IN (SELECT id FROM scope)
  ),
  ranked AS (
    SELECT
      r.id, r.doj,
      CASE r.lvl_name
        WHEN 'M0' THEN 0  WHEN 'M1' THEN 1  WHEN 'M2' THEN 2
        WHEN 'M3' THEN 3  WHEN 'M4' THEN 4  WHEN 'M5' THEN 5
        WHEN 'M6' THEN 6  WHEN 'M7' THEN 7
        WHEN 'W1' THEN 8  WHEN 'W2' THEN 9  WHEN 'W3' THEN 10
        WHEN 'W4' THEN 11 WHEN 'W5' THEN 12
        ELSE 99
      END AS level_rank
    FROM roots r
  )
  SELECT id INTO _winner
  FROM ranked
  ORDER BY level_rank ASC, doj ASC NULLS LAST, id ASC
  LIMIT 1;

  RETURN _winner;
END;
$$;
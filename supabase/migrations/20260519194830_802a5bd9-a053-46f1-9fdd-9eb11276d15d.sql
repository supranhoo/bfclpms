
CREATE OR REPLACE FUNCTION public.safety_drill_dump(_table text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, safety_drill
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'safety_officer')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _table NOT IN ('safety_incidents','safety_permits','safety_audit_runs') THEN
    RAISE EXCEPTION 'invalid table: %', _table;
  END IF;
  EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM safety_drill.%I t', _table)
    INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.safety_drill_load(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, safety_drill
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'safety_officer')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _table NOT IN ('safety_incidents','safety_permits','safety_audit_runs') THEN
    RAISE EXCEPTION 'invalid table: %', _table;
  END IF;
  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN 0;
  END IF;
  EXECUTE format(
    'INSERT INTO safety_drill.%I SELECT * FROM jsonb_populate_recordset(NULL::safety_drill.%I, $1)',
    _table, _table
  ) USING _rows;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.safety_drill_dump(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_drill_load(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safety_drill_dump(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safety_drill_load(text, jsonb) TO authenticated;

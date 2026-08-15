CREATE OR REPLACE FUNCTION public.kpi_split_text(p_text text)
RETURNS TABLE (title text, description text, formula text, scoring_logic text, confidence text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_ws constant text := E' \t\r\n';
  v_scoring text;
  v_formula text;
  v_head text;
  v_head2 text;
  v_title text;
  v_desc text;
  v_conf text;
BEGIN
  IF p_text IS NULL OR btrim(p_text, v_ws) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, 'empty'::text;
    RETURN;
  END IF;

  v_scoring := (regexp_match(p_text, '(?is)(?:^|\n|\s|-)\s*scoring(?:\s+logic)?\s*[:\-]+\s*(.*)$'))[1];
  IF v_scoring IS NOT NULL THEN
    v_head := regexp_replace(p_text, '(?is)(?:^|\n|\s|-)\s*scoring(?:\s+logic)?\s*[:\-]+\s*.*$', '');
  ELSE
    v_head := p_text;
  END IF;

  v_formula := (regexp_match(v_head, '(?is)(?:^|\n|\s|-)\s*formula\s*[:\-]+\s*(.*)$'))[1];
  IF v_formula IS NOT NULL THEN
    v_head2 := regexp_replace(v_head, '(?is)(?:^|\n|\s|-)\s*formula\s*[:\-]+\s*.*$', '');
  ELSE
    v_head2 := v_head;
  END IF;

  v_title := btrim(split_part(v_head2, E'\n', 1), v_ws);
  v_title := btrim(regexp_replace(v_title, '(?is)^-\s*', ''), v_ws);

  v_desc := btrim(substr(v_head2, length(split_part(v_head2, E'\n', 1)) + 1), v_ws);
  v_desc := btrim(regexp_replace(v_desc, '(?is)^[\s\-]*description\s*[:\-]+\s*', ''), v_ws);

  -- Text that opens straight into "Description: ..." has no title line.
  IF v_title <> '' AND v_title ~* '^[\s\-]*description\s*[:\-]+' THEN
    v_desc := btrim(
      btrim(regexp_replace(v_title, '(?is)^[\s\-]*description\s*[:\-]+\s*', ''), v_ws)
      || CASE WHEN v_desc <> '' THEN E'\n' || v_desc ELSE '' END, v_ws);
    v_title := '';
  END IF;

  v_desc := NULLIF(v_desc, '');
  v_formula := NULLIF(btrim(coalesce(v_formula, ''), v_ws), '');
  v_scoring := NULLIF(btrim(coalesce(v_scoring, ''), v_ws), '');

  IF v_formula IS NOT NULL AND v_scoring IS NOT NULL AND v_title <> '' AND length(v_title) <= 120 THEN
    v_conf := 'high';
  ELSIF v_formula IS NULL AND v_scoring IS NULL THEN
    v_conf := 'unparsed';
  ELSE
    v_conf := 'review';
  END IF;

  RETURN QUERY SELECT NULLIF(v_title, ''), v_desc, v_formula, v_scoring, v_conf;
END;
$$;
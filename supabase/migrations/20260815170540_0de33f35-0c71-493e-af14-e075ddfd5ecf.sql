CREATE OR REPLACE FUNCTION public.kpi_split_set_parts(
  p_kpi_id uuid,
  p_title text,
  p_description text,
  p_formula text,
  p_scoring_logic text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.kpis%ROWTYPE;
  v_run uuid := gen_random_uuid();
  v_ws constant text := E' \t\r\n';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can edit KPI structured text';
  END IF;

  SELECT * INTO v_row FROM public.kpis WHERE id = p_kpi_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KPI not found';
  END IF;

  IF coalesce(public.kpi_fiscal_start_year(v_row.review_period, v_row.review_year), 0) < 2026 THEN
    RAISE EXCEPTION 'Structured KPI text is only available from July 2026 onward (this KPI is %, %)',
      v_row.review_period, v_row.review_year;
  END IF;

  INSERT INTO public.kpi_text_split_audit
    (run_id, kpi_id, review_period, review_year, kpi_name, before_parts, after_parts, confidence, performed_by)
  VALUES (
    v_run, v_row.id, v_row.review_period, v_row.review_year, v_row.kpi_name,
    jsonb_build_object('title', v_row.kpi_title, 'description', v_row.kpi_description,
                       'formula', v_row.kpi_formula, 'scoring_logic', v_row.kpi_scoring_logic),
    jsonb_build_object('title', NULLIF(btrim(coalesce(p_title, ''), v_ws), ''),
                       'description', NULLIF(btrim(coalesce(p_description, ''), v_ws), ''),
                       'formula', NULLIF(btrim(coalesce(p_formula, ''), v_ws), ''),
                       'scoring_logic', NULLIF(btrim(coalesce(p_scoring_logic, ''), v_ws), '')),
    'manual', auth.uid());

  UPDATE public.kpis
  SET kpi_title = NULLIF(btrim(coalesce(p_title, ''), v_ws), ''),
      kpi_description = NULLIF(btrim(coalesce(p_description, ''), v_ws), ''),
      kpi_formula = NULLIF(btrim(coalesce(p_formula, ''), v_ws), ''),
      kpi_scoring_logic = NULLIF(btrim(coalesce(p_scoring_logic, ''), v_ws), '')
  WHERE id = p_kpi_id;

  RETURN jsonb_build_object('run_id', v_run, 'kpi_id', p_kpi_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_split_set_parts(uuid, text, text, text, text) TO authenticated;
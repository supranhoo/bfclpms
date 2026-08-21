
DROP FUNCTION IF EXISTS public.org_kpi_dataset_rows_read(uuid,integer,text,integer,integer);

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_rows_read(
  p_dataset_id uuid,
  p_review_year integer DEFAULT NULL,
  p_review_period text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,100),1), 500);
  v_offset int := GREATEST(COALESCE(p_offset,0),0);
  v_total int;
  v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT count(*) INTO v_total
  FROM public.org_kpi_dataset_rows r
  WHERE r.dataset_id = p_dataset_id
    AND (p_review_year IS NULL OR r.review_year = p_review_year)
    AND (p_review_period IS NULL OR r.review_period = p_review_period)
    AND public.can_read_kpi_dataset_row(v_user, r.*);

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT to_jsonb(r) AS x
    FROM public.org_kpi_dataset_rows r
    WHERE r.dataset_id = p_dataset_id
      AND (p_review_year IS NULL OR r.review_year = p_review_year)
      AND (p_review_period IS NULL OR r.review_period = p_review_period)
      AND public.can_read_kpi_dataset_row(v_user, r.*)
    ORDER BY r.review_year, r.period_start NULLS LAST, r.review_period, r.scope_label NULLS FIRST
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_get(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_upsert_def(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_rows_read(uuid,integer,text,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_row_save(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_row_delete(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_bulk_import(uuid,jsonb,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_rollup(uuid,integer,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_validate(uuid,integer,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_validation_state(uuid,integer,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_kpi_dataset_row(uuid, public.org_kpi_dataset_rows) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_kpi_dataset(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_org_scope(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.okd_invalidate_validation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_get(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_upsert_def(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_rows_read(uuid,integer,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_row_save(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_row_delete(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_bulk_import(uuid,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_rollup(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_validate(uuid,integer,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_validation_state(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_kpi_dataset_row(uuid, public.org_kpi_dataset_rows) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_kpi_dataset(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_org_scope(uuid) TO authenticated;

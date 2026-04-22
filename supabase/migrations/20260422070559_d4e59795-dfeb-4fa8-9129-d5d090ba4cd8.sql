DO $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH april_sigs AS (
    SELECT DISTINCT k.category_id, k.kra_name, k.kpi_name
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.review_period = 'April'
      AND k.review_year = 2026
  ),
  missing AS (
    SELECT a.category_id, a.kra_name, a.kpi_name
    FROM april_sigs a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.org_kpi_values o
      WHERE o.category_id = a.category_id
        AND o.kra_name = a.kra_name
        AND o.kpi_name = a.kpi_name
        AND o.review_period = 'April'
        AND o.review_year = 2026
    )
  ),
  march_template AS (
    SELECT DISTINCT ON (o.category_id, o.kra_name, o.kpi_name)
      o.category_id, o.kra_name, o.kpi_name,
      o.target_value, o.criteria, o.uom_type, o.qualitative_options,
      o.r0, o.r1, o.r2, o.r3, o.r4, o.r5, o.department_id
    FROM public.org_kpi_values o
    WHERE o.review_period = 'March' AND o.review_year = 2026
    ORDER BY o.category_id, o.kra_name, o.kpi_name, o.created_at DESC
  ),
  kpi_template AS (
    SELECT DISTINCT ON (k.category_id, k.kra_name, k.kpi_name)
      k.category_id, k.kra_name, k.kpi_name,
      k.target_value, k.criteria, k.uom_type, k.qualitative_options,
      k.r0, k.r1, k.r2, k.r3, k.r4, k.r5
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.review_period = 'April'
      AND k.review_year = 2026
    ORDER BY k.category_id, k.kra_name, k.kpi_name, k.created_at DESC
  ),
  ins AS (
    INSERT INTO public.org_kpi_values (
      category_id, kra_name, kpi_name, review_period, review_year,
      target_value, criteria, uom_type, qualitative_options,
      r0, r1, r2, r3, r4, r5, department_id,
      status, achieved_value, entered_by, is_na
    )
    SELECT
      m.category_id, m.kra_name, m.kpi_name, 'April', 2026,
      COALESCE(mt.target_value, kt.target_value),
      COALESCE(mt.criteria, kt.criteria, 'Higher is Better'),
      COALESCE(mt.uom_type, kt.uom_type, 'numeric'),
      COALESCE(mt.qualitative_options, kt.qualitative_options),
      COALESCE(mt.r0, kt.r0),
      COALESCE(mt.r1, kt.r1),
      COALESCE(mt.r2, kt.r2),
      COALESCE(mt.r3, kt.r3),
      COALESCE(mt.r4, kt.r4),
      COALESCE(mt.r5, kt.r5),
      mt.department_id,
      'pending', NULL, NULL, false
    FROM missing m
    LEFT JOIN march_template mt
      ON mt.category_id = m.category_id AND mt.kra_name = m.kra_name AND mt.kpi_name = m.kpi_name
    LEFT JOIN kpi_template kt
      ON kt.category_id = m.category_id AND kt.kra_name = m.kra_name AND kt.kpi_name = m.kpi_name
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  IF v_inserted > 0 THEN
    INSERT INTO public.kpi_audit_logs (
      kpi_id, action, performed_by, metadata, new_value
    )
    SELECT
      k.id,
      'BULK_OKV_ANCHOR_BACKFILL',
      NULL,
      jsonb_build_object(
        'period', 'April',
        'year', 2026,
        'anchored', v_inserted,
        'system_action', true,
        'reason', 'April 2026 OKV anchor gap repair (v2.66.7.6)'
      ),
      jsonb_build_object('summary', true)
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.review_period = 'April'
      AND k.review_year = 2026
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Backfilled % April 2026 OKV anchors', v_inserted;
END $$;
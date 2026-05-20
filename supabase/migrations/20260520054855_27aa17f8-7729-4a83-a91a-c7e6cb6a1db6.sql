
DO $$
DECLARE
  v_target_month text;
  v_target_year  integer := 2026;
  v_inserted     integer;
  v_total        integer := 0;
BEGIN
  -- Pause the cascade triggers — we are intentionally writing already-effective
  -- carry-forward rows, not user-driven workflow changes.
  ALTER TABLE public.workflow_config DISABLE TRIGGER trg_workflow_change_step_back;
  ALTER TABLE public.workflow_config DISABLE TRIGGER trg_repercolate_on_workflow_config_change;

  -- Month index helper inline. April=4, May=5, June=6.
  FOR v_target_month IN SELECT unnest(ARRAY['April','May','June']) LOOP

    WITH month_rank AS (
      SELECT m.name, m.idx
      FROM (VALUES
        ('January',1),('February',2),('March',3),('April',4),('May',5),('June',6),
        ('July',7),('August',8),('September',9),('October',10),('November',11),('December',12)
      ) AS m(name, idx)
    ),
    target AS (
      SELECT (SELECT idx FROM month_rank WHERE name = v_target_month) AS tmonth,
             v_target_year::int AS tyear
    ),
    ranked AS (
      SELECT
        wc.config_value,
        wc.workflow_template_id,
        wc.review_period,
        wc.review_year,
        ROW_NUMBER() OVER (
          PARTITION BY wc.config_value
          ORDER BY wc.review_year DESC, mr.idx DESC
        ) AS rn
      FROM public.workflow_config wc
      JOIN month_rank mr ON mr.name = wc.review_period
      CROSS JOIN target t
      WHERE wc.config_type = 'employee'
        AND wc.review_period IS NOT NULL
        AND (wc.review_year < t.tyear
             OR (wc.review_year = t.tyear AND mr.idx < t.tmonth))
    ),
    latest_per_emp AS (
      SELECT config_value, workflow_template_id
      FROM ranked
      WHERE rn = 1
    )
    INSERT INTO public.workflow_config
      (config_type, config_value, workflow_template_id, review_period, review_year, is_ongoing, created_by)
    SELECT 'employee', lpe.config_value, lpe.workflow_template_id, v_target_month, v_target_year, false, NULL
    FROM latest_per_emp lpe
    ON CONFLICT (config_type, config_value, review_period, review_year)
      WHERE review_period IS NOT NULL
      DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_total := v_total + v_inserted;
    RAISE NOTICE 'Carry-forward % 2026: % rows inserted', v_target_month, v_inserted;
  END LOOP;

  RAISE NOTICE 'Total carry-forward rows inserted: %', v_total;

  ALTER TABLE public.workflow_config ENABLE TRIGGER trg_workflow_change_step_back;
  ALTER TABLE public.workflow_config ENABLE TRIGGER trg_repercolate_on_workflow_config_change;

  -- Reconcile KPI active stages for the three target months so active stages
  -- reflect the now-effective templates.
  PERFORM public.reconcile_workflow_statuses('April', 2026);
  PERFORM public.reconcile_workflow_statuses('May',   2026);
  PERFORM public.reconcile_workflow_statuses('June',  2026);
END;
$$ LANGUAGE plpgsql;

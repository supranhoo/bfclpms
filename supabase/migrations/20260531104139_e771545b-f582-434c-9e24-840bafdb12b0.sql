
DO $$
DECLARE
  v_repaired int := 0;
  r          record;
  v_org      record;
  v_actor    uuid;
  v_emp_dept uuid;
BEGIN
  FOR r IN
    SELECT rs.id AS submission_id,
           rs.kpi_id,
           rs.achieved_value AS corrected_value,
           k.kra_name, k.kpi_name, k.review_period, k.review_year,
           k.is_org_level, k.org_level_scope, k.employee_id
      FROM public.review_submissions rs
      JOIN public.kpis k ON k.id = rs.kpi_id
     WHERE rs.skipped_by_management->>'override' = 'true'
       AND k.is_org_level = true
       AND rs.achieved_value IS NOT NULL
  LOOP
    SELECT department_id INTO v_emp_dept
      FROM public.profiles WHERE id = r.employee_id;

    SELECT o.*
      INTO v_org
      FROM public.org_kpi_values o
     WHERE o.kra_name = r.kra_name
       AND o.kpi_name = r.kpi_name
       AND o.review_period = r.review_period
       AND o.review_year = r.review_year
       AND (
         r.org_level_scope = 'organization'
         OR (r.org_level_scope = 'department'
             AND o.department_id IS NOT DISTINCT FROM v_emp_dept)
         OR (r.org_level_scope = 'employee'
             AND o.employee_id  IS NOT DISTINCT FROM r.employee_id)
       )
     LIMIT 1;

    IF v_org.id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_org.achieved_value IS NOT DISTINCT FROM r.corrected_value THEN
      CONTINUE;
    END IF;

    SELECT performed_by
      INTO v_actor
      FROM public.kpi_audit_logs
     WHERE kpi_id = r.kpi_id
       AND action IN ('ADMIN_BULK_OVERRIDE_FINAL_STAMP',
                      'ADMIN_BULK_OVERRIDE_FINAL_RESTAMP')
     ORDER BY created_at DESC
     LIMIT 1;

    UPDATE public.org_kpi_values
       SET achieved_value = r.corrected_value,
           entered_by     = COALESCE(v_actor, entered_by),
           updated_at     = now()
     WHERE id = v_org.id;

    INSERT INTO public.kpi_audit_logs(
      kpi_id, action, performed_by, old_value, new_value, metadata
    ) VALUES (
      r.kpi_id,
      'ORG_KPI_VALUE_OVERWRITTEN',
      v_actor,
      jsonb_build_object(
        'achieved_value', v_org.achieved_value,
        'entered_by',     v_org.entered_by
      ),
      jsonb_build_object(
        'achieved_value', r.corrected_value,
        'entered_by',     COALESCE(v_actor, v_org.entered_by)
      ),
      jsonb_build_object(
        'source',           'data_repair_2026_05_31_adr067',
        'org_kpi_value_id', v_org.id,
        'org_level_scope',  r.org_level_scope,
        'submission_id',    r.submission_id,
        'policy',           '§88.1 / ADR-067'
      )
    );

    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE 'ADR-067 repair: % org_kpi_values rows updated', v_repaired;
END $$;

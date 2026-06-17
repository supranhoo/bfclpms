-- v2.66.13.11 — Backfill self_score for org KPI rows where OKV was entered
-- but per-employee propagation was skipped, and the manager has since
-- recorded a score (kpi.status = 'manager_check'). The existing
-- repair_org_kpi_entered_unpropagated_rows() locks out manager_check; this
-- companion function repairs the narrow late-discovery case with full audit.

CREATE OR REPLACE FUNCTION public.repair_org_kpi_late_self_backfill(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  rec record;
  v_repaired int := 0; v_skipped int := 0; v_candidates int := 0;
  v_self_score numeric; v_self_rating text; v_higher_better boolean;
  v_repaired_employees jsonb := '[]'::jsonb;
  v_batch_id uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may run late self backfill';
  END IF;
  v_authorized := true;

  FOR rec IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.target_value, k.criteria,
      k.uom_type::text AS uom_type, k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
      v.id AS okv_id, v.achieved_value AS okv_achieved, v.is_na AS okv_is_na,
      v.remarks AS okv_remarks,
      rs.id AS rs_id, rs.self_score AS rs_self_score, rs.manager_score AS rs_manager_score,
      rs.self_remarks AS rs_self_remarks,
      p.full_name, p.employee_code
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
    JOIN org_kpi_values v
      ON v.category_id = k.category_id AND v.employee_id = k.employee_id
     AND v.review_period = k.review_period AND v.review_year = k.review_year
     AND normalize_kpi_text(v.kra_name) = v_kra_norm
     AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
    JOIN review_submissions rs ON rs.kpi_id = k.id
    WHERE k.is_org_level = true AND k.category_id = p_category_id
      AND k.review_period = p_review_period AND k.review_year = p_review_year
      AND normalize_kpi_text(k.kra_name) = v_kra_norm
      AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
      AND rs.self_score IS NULL
      AND v.achieved_value IS NOT NULL
      AND k.status::text = 'manager_check'
  LOOP
    v_candidates := v_candidates + 1;

    IF COALESCE(rec.okv_is_na, false) THEN
      v_self_score := NULL;
    ELSIF rec.uom_type = 'binary' OR rec.uom_type = 'tiered' THEN
      v_self_score := rec.okv_achieved;
    ELSE
      v_higher_better := COALESCE(rec.criteria, 'Higher is Better') NOT IN ('Lower is Better', 'Lower the Better');
      BEGIN
        IF v_higher_better THEN
          v_self_score := CASE
            WHEN rec.okv_achieved >= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved >= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved >= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved >= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved >= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        ELSE
          v_self_score := CASE
            WHEN rec.okv_achieved <= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved <= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved <= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved <= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved <= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_self_score := 0;
      END;
    END IF;

    v_self_rating := CASE
      WHEN v_self_score IS NULL THEN NULL
      WHEN v_self_score >= 4 THEN 'green'
      WHEN v_self_score >= 3 THEN 'yellow'
      ELSE 'red' END;

    IF p_dry_run THEN
      v_repaired_employees := v_repaired_employees || jsonb_build_object(
        'employee_code', rec.employee_code,
        'full_name', rec.full_name,
        'okv_achieved', rec.okv_achieved,
        'derived_self_score', v_self_score,
        'manager_score', rec.rs_manager_score
      );
      CONTINUE;
    END IF;

    UPDATE review_submissions
      SET achieved_value = COALESCE(achieved_value, rec.okv_achieved),
          self_score = v_self_score,
          self_rating = v_self_rating::rating_level,
          self_remarks = COALESCE(rs_self_remarks, rec.okv_remarks),
          updated_at = now()
      WHERE id = rec.rs_id;

    UPDATE org_kpi_values SET status = 'propagated', updated_at = now() WHERE id = rec.okv_id;

    INSERT INTO kpi_audit_logs (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      rec.kpi_id, rec.rs_id, 'late_self_backfill', v_user,
      jsonb_build_object('self_score', null, 'achieved_value', null),
      jsonb_build_object('self_score', v_self_score, 'self_rating', v_self_rating, 'achieved_value', rec.okv_achieved),
      jsonb_build_object('batch_id', v_batch_id, 'source', 'repair_org_kpi_late_self_backfill', 'okv_id', rec.okv_id)
    );

    v_repaired := v_repaired + 1;
    v_repaired_employees := v_repaired_employees || jsonb_build_object(
      'employee_code', rec.employee_code,
      'full_name', rec.full_name,
      'okv_achieved', rec.okv_achieved,
      'derived_self_score', v_self_score
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'batch_id', v_batch_id,
    'candidates', v_candidates,
    'repaired', v_repaired,
    'skipped', v_skipped,
    'employees', v_repaired_employees
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_org_kpi_late_self_backfill(uuid, text, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_org_kpi_late_self_backfill(uuid, text, text, text, integer, boolean) TO service_role;
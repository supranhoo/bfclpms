
CREATE OR REPLACE FUNCTION public.bulk_management_approve(
  p_cells jsonb,
  p_batch_reason text DEFAULT NULL::text,
  p_attachment_urls jsonb DEFAULT '[]'::jsonb,
  p_achieved_values jsonb DEFAULT NULL::jsonb,
  p_is_override boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor              uuid := auth.uid();
  v_is_admin           boolean := false;
  v_batch_id           uuid := gen_random_uuid();
  v_cell               jsonb;
  v_sub_id             uuid;
  v_exp_ver            int;
  v_cur                record;
  v_kpi                public.kpis;
  v_final              numeric;
  v_old_final          numeric;
  v_source             text;
  v_skipped_stages     jsonb;
  v_applied            int := 0;
  v_advanced           int := 0;
  v_override_count     int := 0;
  v_skipped            jsonb := '[]'::jsonb;
  v_reason             text;
  v_remark             text;
  v_attach             jsonb;
  v_merged_attach      jsonb;
  v_kpi_id             uuid;
  v_drift              jsonb := '[]'::jsonb;
  v_ach_raw            text;
  v_ach_num            numeric;
  v_is_relock          boolean;
  v_org_id             uuid;
  v_prior_org_ach      numeric;
  v_prior_org_entered  uuid;
  v_emp_dept           uuid;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  IF p_batch_reason IS NULL OR length(btrim(p_batch_reason)) < 10 THEN
    RAISE EXCEPTION 'remark required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_attachment_urls, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_attachment_urls must be a json array of urls';
  END IF;

  IF jsonb_array_length(COALESCE(p_attachment_urls, '[]'::jsonb)) > 5 THEN
    RAISE EXCEPTION 'too many attachments (max 5)';
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin'::public.app_role);

  IF p_is_override AND NOT v_is_admin THEN
    RAISE EXCEPTION 'override_requires_admin' USING ERRCODE = '42501';
  END IF;

  v_attach := COALESCE(p_attachment_urls, '[]'::jsonb);
  v_remark := btrim(p_batch_reason);

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id   := (v_cell->>'submission_id')::uuid;
    v_exp_ver  := NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason   := NULL;
    v_final    := NULL;
    v_old_final:= NULL;
    v_source   := NULL;
    v_is_relock:= false;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, row_version,
           management_evidence_urls, management_remarks, kpi_status
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL AND NOT p_is_override THEN
      v_reason := 'already_final';
    ELSIF v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver AND NOT p_is_override THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    IF p_is_override THEN
      v_ach_raw := NULLIF(p_achieved_values->>v_sub_id::text, '');
      IF v_ach_raw IS NULL THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_sub_id, 'reason', 'override_value_required');
        CONTINUE;
      END IF;

      BEGIN
        v_ach_num := v_ach_raw::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_sub_id, 'reason', 'override_value_invalid');
        CONTINUE;
      END;

      SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
      IF NOT FOUND THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_sub_id, 'reason', 'kpi_not_found');
        CONTINUE;
      END IF;

      v_final := public.fn_compute_rating_from_achievement(v_kpi, v_ach_num, NULL);
      IF v_final IS NULL THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_sub_id, 'reason', 'override_compute_failed');
        CONTINUE;
      END IF;

      v_source     := 'override';
      v_old_final  := v_cur.final_score;
      v_is_relock  := v_cur.final_score IS NOT NULL;

      UPDATE public.review_submissions
         SET achieved_value = v_ach_num
       WHERE id = v_sub_id;

      -- ADR-067: back-write the Org-KPI master row so per-stage UI
      -- (which reads from org_kpi_values) reflects the corrected
      -- achievement. Frozen review_submissions snapshots stay intact.
      IF v_kpi.is_org_level = true THEN
        -- department is held on the employee profile, not on kpis.
        SELECT department_id INTO v_emp_dept
          FROM public.profiles
         WHERE id = v_kpi.employee_id;

        SELECT o.id, o.achieved_value, o.entered_by
          INTO v_org_id, v_prior_org_ach, v_prior_org_entered
          FROM public.org_kpi_values o
         WHERE o.kra_name = v_kpi.kra_name
           AND o.kpi_name = v_kpi.kpi_name
           AND o.review_period = v_kpi.review_period
           AND o.review_year = v_kpi.review_year
           AND (
             v_kpi.org_level_scope = 'organization'
             OR (v_kpi.org_level_scope = 'department'
                 AND o.department_id IS NOT DISTINCT FROM v_emp_dept)
             OR (v_kpi.org_level_scope = 'employee'
                 AND o.employee_id  IS NOT DISTINCT FROM v_kpi.employee_id)
           )
         LIMIT 1
         FOR UPDATE;

        IF v_org_id IS NOT NULL THEN
          UPDATE public.org_kpi_values
             SET achieved_value = v_ach_num,
                 entered_by     = v_actor,
                 updated_at     = now()
           WHERE id = v_org_id;

          INSERT INTO public.kpi_audit_logs(
            kpi_id, action, performed_by, old_value, new_value, metadata
          ) VALUES (
            v_cur.kpi_id,
            'ORG_KPI_VALUE_OVERWRITTEN',
            v_actor,
            jsonb_build_object(
              'achieved_value', v_prior_org_ach,
              'entered_by',     v_prior_org_entered
            ),
            jsonb_build_object(
              'achieved_value', v_ach_num,
              'entered_by',     v_actor
            ),
            jsonb_build_object(
              'source',           'bulk_management_approve_override',
              'org_kpi_value_id', v_org_id,
              'org_level_scope',  v_kpi.org_level_scope,
              'submission_id',    v_sub_id,
              'batch_id',         v_batch_id,
              'batch_reason',     v_remark,
              'policy',           '§88.1 / ADR-067'
            )
          );
        END IF;
      END IF;

    ELSE
      IF v_cur.auditor_score IS NOT NULL THEN
        v_final := v_cur.auditor_score;     v_source := 'auditor';
      ELSIF v_cur.hr_pms_score IS NOT NULL THEN
        v_final := v_cur.hr_pms_score;      v_source := 'hr_pms';
      ELSIF v_cur.skip_level_score IS NOT NULL THEN
        v_final := v_cur.skip_level_score;  v_source := 'skip_level';
      ELSIF v_cur.manager_score IS NOT NULL THEN
        v_final := v_cur.manager_score;     v_source := 'manager';
      ELSE
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_sub_id, 'reason', 'no_completed_stage');
        CONTINUE;
      END IF;
    END IF;

    v_skipped_stages := jsonb_build_object(
      'manager_missing',    v_cur.manager_score    IS NULL,
      'skip_level_missing', v_cur.skip_level_score IS NULL,
      'hr_pms_missing',     v_cur.hr_pms_score     IS NULL,
      'auditor_missing',    v_cur.auditor_score    IS NULL,
      'source_stage',       v_source,
      'override',           p_is_override
    );

    v_merged_attach := COALESCE(v_cur.management_evidence_urls, '[]'::jsonb) || v_attach;
    IF jsonb_array_length(v_merged_attach) > 10 THEN
      v_merged_attach := (
        SELECT jsonb_agg(value)
          FROM (
            SELECT value FROM jsonb_array_elements(v_merged_attach)
             OFFSET GREATEST(jsonb_array_length(v_merged_attach) - 10, 0)
          ) t
      );
    END IF;

    v_kpi_id := v_cur.kpi_id;

    UPDATE public.review_submissions
       SET final_score              = v_final,
           management_score         = CASE
             WHEN p_is_override THEN v_final
             ELSE COALESCE(management_score, v_final)
           END,
           management_remarks       = CASE
             WHEN management_remarks IS NULL OR length(btrim(management_remarks)) = 0
               THEN v_remark
             ELSE management_remarks || E'\n\n[' ||
                  CASE WHEN p_is_override THEN 'Admin override' ELSE 'Bulk approval' END ||
                  '] ' || v_remark
           END,
           management_evidence_urls = v_merged_attach,
           skipped_by_management    = v_skipped_stages,
           group_write_batch_id     = v_batch_id,
           kpi_status               = 'locked'::public.kpi_status,
           row_version              = row_version + 1,
           updated_at               = now()
     WHERE id = v_sub_id;

    v_applied := v_applied + 1;
    IF p_is_override THEN v_override_count := v_override_count + 1; END IF;

    UPDATE public.kpis
       SET status = 'approved'::public.review_status,
           updated_at = now()
     WHERE id = v_kpi_id
       AND status <> 'approved'::public.review_status;

    v_advanced := v_advanced + 1;

    IF p_is_override THEN
      INSERT INTO public.kpi_audit_logs(
        kpi_id, action, performed_by, old_value, new_value, metadata
      ) VALUES (
        v_kpi_id,
        CASE WHEN v_is_relock
          THEN 'ADMIN_BULK_OVERRIDE_FINAL_RESTAMP'
          ELSE 'ADMIN_BULK_OVERRIDE_FINAL_STAMP' END,
        v_actor,
        jsonb_build_object('final_score', v_old_final),
        jsonb_build_object('final_score', v_final, 'achieved', v_ach_num),
        jsonb_build_object(
          'batch_id',     v_batch_id,
          'submission_id', v_sub_id,
          'acted_stage',  'management',
          'is_relock',    v_is_relock,
          'batch_reason', v_remark,
          'policy',       '§88.1'
        )
      );
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(rs.id), '[]'::jsonb)
    INTO v_drift
    FROM public.review_submissions rs
    JOIN public.kpis k ON k.id = rs.kpi_id
   WHERE rs.group_write_batch_id = v_batch_id
     AND (rs.kpi_status <> 'locked'::public.kpi_status
          OR k.status   <> 'approved'::public.review_status);

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id,
    v_actor,
    CASE WHEN p_is_override THEN 'management_override' ELSE 'management_approve' END,
    jsonb_build_object(
      'attachment_count', jsonb_array_length(v_attach),
      'attachment_urls',  v_attach,
      'drift_ids',        v_drift,
      'advanced_count',   v_advanced,
      'override_count',   v_override_count,
      'is_override',      p_is_override
    ),
    v_applied,
    v_skipped,
    p_batch_reason
  );

  IF jsonb_array_length(v_drift) > 0 THEN
    RAISE EXCEPTION 'bulk_advance_drift: % cells stamped but not advanced (batch=%)',
      jsonb_array_length(v_drift), v_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'batch_id',        v_batch_id,
    'applied',         v_applied,
    'advanced',        v_advanced,
    'override_count',  v_override_count,
    'skipped',         v_skipped
  );
END;
$function$;

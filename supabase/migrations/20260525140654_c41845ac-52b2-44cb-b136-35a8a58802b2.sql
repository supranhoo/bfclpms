
-- Chain reconcile_workflow_statuses for scoped runs + include kra_set in Branch 2b.
-- Surface not_terminal_for_template skip reason in bulk_write_stage_scores.

CREATE OR REPLACE FUNCTION public.reconcile_workflow_statuses(
  p_review_period text DEFAULT NULL::text,
  p_review_year   integer DEFAULT NULL::integer,
  p_dry_run       boolean DEFAULT true,
  p_performed_by  uuid    DEFAULT NULL::uuid,
  p_kpi_ids       uuid[]  DEFAULT NULL::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kpi RECORD;
  v_workflow RECORD;
  v_stages JSONB;
  v_stage_keys TEXT[];
  v_current_idx INTEGER;
  v_next_status TEXT;
  v_reason TEXT;
  v_affected JSONB := '[]'::jsonb;
  v_count INTEGER := 0;
  v_score_field TEXT;
  v_has_score BOOLEAN;
  v_terminal_stage TEXT;
  v_next_reviewer_exists BOOLEAN;
  v_stage_key TEXT;
  v_performer UUID;
  v_has_recent_rollback BOOLEAN;
  v_current_status TEXT;
  v_max_hops INTEGER;
  v_hop INTEGER;
BEGIN
  v_performer := COALESCE(p_performed_by, auth.uid());

  FOR v_kpi IN
    SELECT
      k.id AS kpi_id,
      k.status::text AS current_status,
      k.employee_id,
      k.kpi_name,
      k.kra_name,
      k.review_period,
      k.review_year,
      p.full_name AS employee_name,
      p.employee_code
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    WHERE k.status != 'approved'
      AND (p_review_period IS NULL OR k.review_period = p_review_period)
      AND (p_review_year IS NULL OR k.review_year = p_review_year)
      AND (p_kpi_ids IS NULL OR k.id = ANY(p_kpi_ids))
    ORDER BY p.full_name, k.kra_name
  LOOP
    -- Chain hops: when caller scopes by kpi_ids, evaluate same KPI repeatedly
    -- until no further transition is available (max = workflow length). For
    -- unscoped runs we keep legacy one-hop semantics.
    v_current_status := v_kpi.current_status;
    v_max_hops := CASE WHEN p_kpi_ids IS NULL THEN 1 ELSE 8 END;

    FOR v_hop IN 1..v_max_hops LOOP
      v_next_status := NULL;
      v_reason := NULL;

      SELECT wf.stages INTO v_stages
      FROM get_employee_workflow_info(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year) wf
      LIMIT 1;

      IF v_stages IS NULL THEN EXIT; END IF;

      SELECT ARRAY(SELECT jsonb_array_elements_text(v_stages)) INTO v_stage_keys;
      IF v_stage_keys IS NULL OR array_length(v_stage_keys, 1) = 0 THEN EXIT; END IF;

      v_current_idx := NULL;
      FOR i IN 1..array_length(v_stage_keys, 1) LOOP
        IF v_stage_keys[i] = v_current_status THEN
          v_current_idx := i;
          EXIT;
        END IF;
      END LOOP;

      v_terminal_stage := v_stage_keys[array_length(v_stage_keys, 1)];

      -- BRANCH 1: Orphaned status
      IF v_current_idx IS NULL THEN
        DECLARE
          v_canonical TEXT[] := ARRAY['kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review'];
          v_orphan_pos INTEGER := 0;
          v_candidate TEXT;
          v_found BOOLEAN := false;
        BEGIN
          FOR i IN 1..array_length(v_canonical, 1) LOOP
            IF v_canonical[i] = v_current_status THEN v_orphan_pos := i; EXIT; END IF;
          END LOOP;

          IF v_orphan_pos > 0 THEN
            FOR i IN (v_orphan_pos + 1)..array_length(v_canonical, 1) LOOP
              v_candidate := v_canonical[i];
              IF v_candidate = ANY(v_stage_keys) THEN
                v_next_status := v_candidate; v_found := true; EXIT;
              END IF;
            END LOOP;
          END IF;

          IF NOT v_found THEN v_next_status := 'approved'; END IF;
          v_reason := 'missing_stage_orphan';
        END;
      ELSE
        -- BRANCH 2a: Terminal stage with score -> approve
        IF v_current_status = v_terminal_stage THEN
          v_score_field := CASE v_terminal_stage
            WHEN 'self_review' THEN 'self_score'
            WHEN 'manager_check' THEN 'manager_score'
            WHEN 'skip_level_check' THEN 'skip_level_score'
            WHEN 'hr_pms_review' THEN 'hr_pms_score'
            WHEN 'audit' THEN 'auditor_score'
            WHEN 'management_review' THEN 'management_score'
            ELSE NULL
          END;

          IF v_score_field IS NOT NULL THEN
            EXECUTE format(
              'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
              v_score_field
            ) INTO v_has_score USING v_kpi.kpi_id;

            IF v_has_score THEN
              v_next_status := 'approved';
              v_reason := 'terminal_stage_completed';
            END IF;
          END IF;
        END IF;

        -- BRANCH 2b: Scored at current stage but not forwarded
        -- v2.66.13.16: include 'kra_set' so Override writes from a never-self-submitted
        -- baseline can advance via the same path instead of falling into Branch 3.
        IF v_next_status IS NULL AND v_current_idx < array_length(v_stage_keys, 1) THEN
          IF v_current_status IN ('kra_set','self_review','manager_check','skip_level_check','hr_pms_review','audit') THEN
            v_next_reviewer_exists := false;
            FOR j IN (v_current_idx + 1)..array_length(v_stage_keys, 1) LOOP
              v_stage_key := v_stage_keys[j];
              IF v_stage_key IN ('manager_check','skip_level_check','hr_pms_review','audit','management_review') THEN
                v_next_reviewer_exists := true; EXIT;
              END IF;
            END LOOP;

            IF v_next_reviewer_exists THEN
              -- For non-kra_set rows the legacy contract was: skip the KPI entirely
              -- (CONTINUE outer). Preserve that semantics only on the first hop so we
              -- don't break callers; for kra_set we let it fall through and rely on
              -- Branch 3 to jump forward to whichever stage actually has a score.
              IF v_current_status <> 'kra_set' THEN
                EXIT;
              END IF;
            END IF;
          END IF;

          IF v_next_status IS NULL AND v_current_status <> 'kra_set' THEN
            v_score_field := CASE v_current_status
              WHEN 'self_review' THEN 'self_score'
              WHEN 'manager_check' THEN 'manager_score'
              WHEN 'skip_level_check' THEN 'skip_level_score'
              WHEN 'hr_pms_review' THEN 'hr_pms_score'
              WHEN 'audit' THEN 'auditor_score'
              WHEN 'management_review' THEN 'management_score'
              ELSE NULL
            END;

            IF v_score_field IS NOT NULL THEN
              EXECUTE format(
                'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
                v_score_field
              ) INTO v_has_score USING v_kpi.kpi_id;

              IF v_has_score THEN
                v_next_status := v_stage_keys[v_current_idx + 1];
                v_reason := 'current_stage_scored_not_forwarded';
              END IF;
            END IF;
          END IF;
        END IF;

        -- BRANCH 3: Review-stage mismatch (with rollback-awareness)
        IF v_next_status IS NULL THEN
          DECLARE
            v_check_field TEXT;
            v_mismatch_found BOOLEAN := false;
          BEGIN
            FOR j IN REVERSE array_length(v_stage_keys, 1)..1 LOOP
              IF j <= v_current_idx THEN EXIT; END IF;

              v_check_field := CASE v_stage_keys[j]
                WHEN 'self_review' THEN 'self_score'
                WHEN 'manager_check' THEN 'manager_score'
                WHEN 'skip_level_check' THEN 'skip_level_score'
                WHEN 'hr_pms_review' THEN 'hr_pms_score'
                WHEN 'audit' THEN 'auditor_score'
                WHEN 'management_review' THEN 'management_score'
                ELSE NULL
              END;

              IF v_check_field IS NOT NULL THEN
                EXECUTE format(
                  'SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = $1 AND %I IS NOT NULL)',
                  v_check_field
                ) INTO v_mismatch_found USING v_kpi.kpi_id;

                IF v_mismatch_found THEN
                  SELECT EXISTS (
                    SELECT 1 FROM kpi_audit_logs
                    WHERE kpi_id = v_kpi.kpi_id
                      AND action IN ('ROLLBACK_APPROVED','STATUS_TRANSITION','ADMIN_STATUS_STEP_BACK')
                      AND (new_value->>'status')::text = v_current_status
                      AND created_at > (
                        SELECT COALESCE(MAX(rs.updated_at), '1970-01-01'::timestamptz)
                        FROM review_submissions rs WHERE rs.kpi_id = v_kpi.kpi_id
                      )
                  ) INTO v_has_recent_rollback;

                  IF v_has_recent_rollback THEN
                    v_mismatch_found := false;
                    CONTINUE;
                  END IF;

                  v_next_status := v_stage_keys[j];
                  v_reason := 'review_stage_mismatch';
                  EXIT;
                END IF;
              END IF;
            END LOOP;
          END;
        END IF;
      END IF;

      -- Stop chaining when no further transition is available.
      IF v_next_status IS NULL THEN EXIT; END IF;

      -- Record transition
      v_count := v_count + 1;
      v_affected := v_affected || jsonb_build_object(
        'kpi_id', v_kpi.kpi_id,
        'employee_name', v_kpi.employee_name,
        'employee_id', v_kpi.employee_id,
        'employee_code', v_kpi.employee_code,
        'kpi_name', v_kpi.kpi_name,
        'kra_name', v_kpi.kra_name,
        'old_status', v_current_status,
        'new_status', v_next_status,
        'reason', v_reason,
        'review_period', v_kpi.review_period,
        'review_year', v_kpi.review_year,
        'hop', v_hop
      );

      IF NOT p_dry_run THEN
        UPDATE kpis SET status = v_next_status::review_status WHERE id = v_kpi.kpi_id;

        IF v_next_status = 'approved' THEN
          UPDATE review_submissions
          SET final_score = CASE v_terminal_stage
                WHEN 'management_review' THEN management_score
                WHEN 'audit' THEN auditor_score
                WHEN 'hr_pms_review' THEN hr_pms_score
                WHEN 'skip_level_check' THEN skip_level_score
                WHEN 'manager_check' THEN manager_score
                WHEN 'self_review' THEN self_score
                ELSE COALESCE(management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score)
              END,
              final_rating = CASE v_terminal_stage
                WHEN 'management_review' THEN management_rating
                WHEN 'audit' THEN auditor_rating
                WHEN 'hr_pms_review' THEN hr_pms_rating
                WHEN 'skip_level_check' THEN skip_level_rating
                WHEN 'manager_check' THEN manager_rating
                WHEN 'self_review' THEN self_rating
                ELSE COALESCE(management_rating, auditor_rating, hr_pms_rating, skip_level_rating, manager_rating, self_rating)
              END
          WHERE kpi_id = v_kpi.kpi_id;
        END IF;

        INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
        VALUES (
          v_kpi.kpi_id,
          'RECONCILE_STATUS',
          v_performer,
          jsonb_build_object('status', v_current_status),
          jsonb_build_object('status', v_next_status),
          jsonb_build_object('reason', v_reason, 'tool', 'reconcile_workflow_statuses', 'hop', v_hop)
        );
      END IF;

      -- Approved is terminal — break the hop loop.
      IF v_next_status = 'approved' THEN EXIT; END IF;

      -- Advance for the next hop. For dry-run we still simulate forward to
      -- accurately preview the full chain.
      v_current_status := v_next_status;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'count', v_count,
    'dry_run', p_dry_run,
    'affected', v_affected
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(
  p_stage text,
  p_cells jsonb,
  p_batch_reason text DEFAULT NULL::text,
  p_attachment_urls jsonb DEFAULT '[]'::jsonb,
  p_manual_scores jsonb DEFAULT NULL::jsonb,
  p_achieved_values jsonb DEFAULT NULL::jsonb,
  p_is_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_cell jsonb;
  v_sub_id uuid;
  v_score numeric;
  v_inherited_from text;
  v_prev_carried numeric;
  v_cell_remarks text;
  v_effective_remarks text;
  v_exp_ver int;
  v_cur record;
  v_kpi public.kpis;
  v_manual numeric;
  v_achieved_in jsonb;
  v_achieved_num numeric;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_hr_override_count int := 0;
  v_period text := NULL;
  v_year  int  := NULL;
  v_affected_kpi_ids uuid[] := ARRAY[]::uuid[];
  v_reconcile_result jsonb;
  v_advanced_count int := 0;
  v_attach jsonb;
  v_attach_count int;
  v_shared_remark text;
  v_is_admin boolean;
  v_manual_count int := 0;
  v_achieved_count int := 0;
  v_acted_stage_key text;
  v_non_terminal_count int := 0;
  v_nt_row record;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF p_stage NOT IN ('manager','skip_level','hr_pms','auditor') THEN
    RAISE EXCEPTION 'invalid stage: %', p_stage;
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  v_shared_remark := COALESCE(btrim(p_batch_reason), '');
  IF length(v_shared_remark) < 10 THEN
    RAISE EXCEPTION 'remark required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  v_attach := COALESCE(p_attachment_urls, '[]'::jsonb);
  IF jsonb_typeof(v_attach) <> 'array' THEN
    RAISE EXCEPTION 'p_attachment_urls must be a json array of urls';
  END IF;
  v_attach_count := jsonb_array_length(v_attach);
  IF v_attach_count > 5 THEN
    RAISE EXCEPTION 'too many attachments (max 5)';
  END IF;

  IF p_manual_scores IS NOT NULL AND jsonb_typeof(p_manual_scores) = 'object' THEN
    SELECT count(*)::int INTO v_manual_count FROM jsonb_object_keys(p_manual_scores);
  END IF;
  IF p_achieved_values IS NOT NULL AND jsonb_typeof(p_achieved_values) = 'object' THEN
    SELECT count(*)::int INTO v_achieved_count FROM jsonb_object_keys(p_achieved_values);
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin'::public.app_role);
  IF p_is_override AND NOT v_is_admin THEN
    p_is_override := false;
  END IF;

  v_acted_stage_key := CASE p_stage
    WHEN 'manager'    THEN 'manager_check'
    WHEN 'skip_level' THEN 'skip_level_check'
    WHEN 'hr_pms'     THEN 'hr_pms_review'
    WHEN 'auditor'    THEN 'audit'
  END;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_cell_remarks := v_cell->>'remarks';
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_inherited_from := NULL;
    v_score := NULL;
    v_prev_carried := NULL;

    v_manual := NULL;
    IF p_manual_scores IS NOT NULL AND p_manual_scores ? v_sub_id::text THEN
      v_manual := NULLIF(p_manual_scores->>v_sub_id::text,'')::numeric;
    END IF;

    v_achieved_in := NULL;
    v_achieved_num := NULL;
    IF p_achieved_values IS NOT NULL AND p_achieved_values ? v_sub_id::text THEN
      v_achieved_in := p_achieved_values->v_sub_id::text;
      BEGIN
        v_achieved_num := NULLIF(regexp_replace(COALESCE(v_achieved_in #>> '{}', ''), '[^0-9.\-]', '', 'g'),'')::numeric;
      EXCEPTION WHEN OTHERS THEN v_achieved_num := NULL; END;
    END IF;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, achieved_value, row_version,
           manager_evidence_urls, skip_level_evidence_urls,
           hr_pms_evidence_urls, auditor_evidence_urls
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL THEN
      v_reason := 'final_locked';
    ELSIF NOT p_is_override AND v_cur.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    ELSIF NOT p_is_override AND p_stage = 'hr_pms' AND v_cur.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    ELSIF NOT p_is_override AND v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NULL AND v_achieved_num IS NOT NULL THEN
      UPDATE public.review_submissions
         SET achieved_value = v_achieved_num
       WHERE id = v_sub_id;
      v_cur.achieved_value := v_achieved_num;
    END IF;

    IF v_reason IS NULL THEN
      v_prev_carried := CASE p_stage
        WHEN 'manager'    THEN v_cur.self_score
        WHEN 'skip_level' THEN COALESCE(v_cur.manager_score, v_cur.self_score)
        WHEN 'hr_pms'     THEN COALESCE(v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score)
        WHEN 'auditor'    THEN COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score)
      END;
    END IF;

    IF v_reason IS NULL THEN
      IF v_manual IS NOT NULL THEN
        v_score := GREATEST(0, LEAST(5, v_manual));
        v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'manual' END;
      ELSIF v_achieved_num IS NOT NULL THEN
        SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
        IF FOUND THEN
          v_score := public.fn_compute_rating_from_achievement(v_kpi, v_achieved_num, NULL);
        END IF;
        IF v_score IS NULL THEN
          v_reason := 'no_prior_score';
        ELSE
          v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'computed_from_achievement' END;
        END IF;
      ELSIF p_is_override THEN
        v_reason := 'override_requires_input';
      ELSE
        IF p_stage = 'manager' THEN
          v_score := v_cur.self_score;
          v_inherited_from := 'self';
        ELSIF p_stage = 'skip_level' THEN
          v_score := COALESCE(v_cur.manager_score, v_cur.self_score);
          v_inherited_from := CASE WHEN v_cur.manager_score IS NOT NULL THEN 'manager' ELSE 'self' END;
        ELSIF p_stage = 'hr_pms' THEN
          v_score := COALESCE(v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score);
          v_inherited_from := CASE
            WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
            WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
            ELSE 'self' END;
        ELSIF p_stage = 'auditor' THEN
          v_score := COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score);
          v_inherited_from := CASE
            WHEN v_cur.hr_pms_score IS NOT NULL THEN 'hr_pms'
            WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
            WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
            ELSE 'self' END;
        END IF;

        IF v_score IS NULL THEN
          SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
          IF FOUND THEN
            v_score := public.fn_compute_rating_from_achievement(
              v_kpi, v_cur.achieved_value, NULL
            );
            IF v_score IS NOT NULL THEN
              v_inherited_from := 'computed_from_achievement';
            END IF;
          END IF;
        END IF;

        IF v_score IS NULL THEN
          v_reason := 'no_prior_score';
        END IF;
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    v_effective_remarks := COALESCE(NULLIF(btrim(v_cell_remarks), ''), v_shared_remark);

    IF p_stage = 'auditor' AND v_cur.hr_pms_score IS NOT NULL THEN
      v_hr_override_count := v_hr_override_count + 1;
    END IF;

    IF p_stage = 'manager' THEN
      UPDATE public.review_submissions
         SET manager_score = v_score,
             manager_remarks = v_effective_remarks,
             manager_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.manager_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE manager_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'skip_level' THEN
      UPDATE public.review_submissions
         SET skip_level_score = v_score,
             skip_level_remarks = v_effective_remarks,
             skip_level_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.skip_level_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE skip_level_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'hr_pms' THEN
      UPDATE public.review_submissions
         SET hr_pms_score = v_score,
             hr_pms_remarks = v_effective_remarks,
             hr_pms_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.hr_pms_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE hr_pms_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'auditor' THEN
      UPDATE public.review_submissions
         SET auditor_score = v_score,
             auditor_remarks = v_effective_remarks,
             auditor_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.auditor_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE auditor_evidence_urls END,
             group_write_batch_id = v_batch_id,
             is_auditor_override_of_hr = (v_cur.hr_pms_score IS NOT NULL),
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    END IF;

    BEGIN
      INSERT INTO public.kpi_audit_logs(
        kpi_id, action, performed_by, new_value, metadata
      ) VALUES (
        v_cur.kpi_id,
        'BULK_STAGE_SIGNOFF_' || upper(p_stage),
        v_actor,
        jsonb_build_object(
          'stage', p_stage,
          'score', v_score,
          'inherited_from', v_inherited_from,
          'remarks', v_effective_remarks,
          'prev_carried', v_prev_carried,
          'achieved_in', v_achieved_in,
          'manual_in', v_manual,
          'is_override', p_is_override
        ),
        jsonb_build_object(
          'batch_id', v_batch_id,
          'submission_id', v_sub_id,
          'attachment_count', v_attach_count,
          'batch_reason', v_shared_remark
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_affected_kpi_ids := v_affected_kpi_ids || v_cur.kpi_id;
    v_applied := v_applied + 1;
  END LOOP;

  IF array_length(v_affected_kpi_ids, 1) > 0 THEN
    BEGIN
      v_reconcile_result := public.reconcile_workflow_statuses(
        p_review_period := NULL,
        p_review_year   := NULL,
        p_dry_run       := false,
        p_performed_by  := v_actor,
        p_kpi_ids       := v_affected_kpi_ids
      );
      v_advanced_count := COALESCE((v_reconcile_result->>'count')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_advanced_count := -1;
    END;

    -- v2.66.13.16: surface rows whose template terminal is NOT the acted stage,
    -- so the toast can explain why those rows didn't reach 'approved'. We compare
    -- the workflow template terminal (resolved per employee) against the acted
    -- stage_key. Rows already on 'approved' are excluded.
    FOR v_nt_row IN
      SELECT k.id AS kpi_id,
             rs.id AS submission_id,
             (
               SELECT s
                 FROM jsonb_array_elements_text(wf.stages) WITH ORDINALITY AS t(s, ord)
                ORDER BY ord DESC
                LIMIT 1
             ) AS terminal_stage,
             k.status::text AS final_status
        FROM unnest(v_affected_kpi_ids) AS akpi(id)
        JOIN public.kpis k ON k.id = akpi.id
        JOIN public.review_submissions rs ON rs.kpi_id = k.id
        CROSS JOIN LATERAL get_employee_workflow_info(k.employee_id, k.review_period, k.review_year) wf
    LOOP
      IF v_nt_row.final_status <> 'approved'
         AND v_nt_row.terminal_stage IS NOT NULL
         AND v_nt_row.terminal_stage <> v_acted_stage_key THEN
        v_skipped := v_skipped || jsonb_build_object(
          'submission_id', v_nt_row.submission_id,
          'reason', 'not_terminal_for_template',
          'terminal_stage', v_nt_row.terminal_stage,
          'acted_stage', v_acted_stage_key
        );
        v_non_terminal_count := v_non_terminal_count + 1;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id, v_actor, p_stage,
    jsonb_build_object(
      'affected_kpi_ids', to_jsonb(v_affected_kpi_ids),
      'reconcile_advanced_count', v_advanced_count,
      'attachment_count', v_attach_count,
      'attachment_urls', v_attach,
      'is_override', p_is_override,
      'manual_count', v_manual_count,
      'achieved_count', v_achieved_count,
      'non_terminal_count', v_non_terminal_count,
      'acted_stage_key', v_acted_stage_key
    ),
    v_applied, v_skipped, p_batch_reason
  );

  IF p_stage = 'auditor' AND v_hr_override_count > 0 THEN
    BEGIN
      SELECT k.review_period, k.review_year
        INTO v_period, v_year
        FROM public.review_submissions rs
        JOIN public.kpis k ON k.id = rs.kpi_id
       WHERE rs.group_write_batch_id = v_batch_id
       LIMIT 1;

      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      SELECT DISTINCT ur.user_id,
             'auditor_override_of_hr',
             'Auditor overrode HR PMS scores',
             format('Auditor updated %s HR PMS-scored cell(s) in %s %s. Tap to review.',
                    v_hr_override_count,
                    COALESCE(v_period,''), COALESCE(v_year::text,'')),
             jsonb_build_object(
               'batch_id', v_batch_id,
               'affected_count', v_hr_override_count,
               'period', v_period,
               'year', v_year,
               'deep_link', '/review/bulk-scoring?batch=' || v_batch_id::text
             )
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.role = 'hr_pms'
         AND COALESCE(p.is_active, true) = true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'advanced', v_advanced_count,
    'skipped', v_skipped,
    'hr_override_count', v_hr_override_count,
    'attachment_count', v_attach_count,
    'is_override', p_is_override,
    'non_terminal_count', v_non_terminal_count,
    'acted_stage_key', v_acted_stage_key
  );
END;
$function$;

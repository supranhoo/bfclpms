
-- ADR-140: Server-side hydration of annual review system scores (retry with correct audit columns)

CREATE OR REPLACE FUNCTION public.compute_carry_kra_contribution(
  p_employee_id uuid,
  p_fy_start    int,
  p_cfg         jsonb,
  p_weight      numeric
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  KPI_SCALE_MAX CONSTANT numeric := 5;
  FY_MONTHS     CONSTANT text[]  := ARRAY['July','August','September','October','November','December',
                                          'January','February','March','April','May','June'];
  v_exclude_na   boolean := COALESCE((p_cfg->>'excludeNa')::boolean, true);
  v_agg          text    := COALESCE(p_cfg->>'aggregation', 'overall_avg');
  v_last_n       int     := COALESCE(NULLIF(p_cfg->>'lastN','')::int, 0);
  v_selected     text[]  := ARRAY[]::text[];
  v_month        text;
  v_i            int;
  v_cal_year     int;
  v_weighted     numeric;
  v_weight_sum   numeric;
  v_monthly      numeric[] := ARRAY[]::numeric[];
  v_chosen       numeric[] := ARRAY[]::numeric[];
  v_rating       numeric;
BEGIN
  IF p_cfg IS NULL OR p_weight IS NULL OR p_weight <= 0 THEN
    RETURN 0;
  END IF;

  IF (p_cfg->'months') IS NOT NULL AND jsonb_typeof(p_cfg->'months') = 'array' THEN
    SELECT COALESCE(array_agg(value), ARRAY[]::text[])
      INTO v_selected
      FROM jsonb_array_elements_text(p_cfg->'months');
  END IF;

  FOR v_i IN 1..array_length(FY_MONTHS,1) LOOP
    v_month    := FY_MONTHS[v_i];
    v_cal_year := CASE WHEN v_i <= 6 THEN p_fy_start ELSE p_fy_start + 1 END;

    SELECT
      SUM(s.score * COALESCE(k.weightage,1)),
      SUM(CASE WHEN s.score IS NOT NULL THEN COALESCE(k.weightage,1) ELSE 0 END)
      INTO v_weighted, v_weight_sum
    FROM public.kpis k
    LEFT JOIN LATERAL (
      SELECT rs.is_na,
             COALESCE(rs.final_score, rs.auditor_score, rs.manager_score, rs.self_score) AS score
        FROM public.review_submissions rs
       WHERE rs.kpi_id = k.id
       LIMIT 1
    ) s ON true
    WHERE k.employee_id  = p_employee_id
      AND k.review_period = v_month
      AND k.review_year   = v_cal_year
      AND (NOT v_exclude_na OR COALESCE(s.is_na,false) = false)
      AND s.score IS NOT NULL;

    IF v_weight_sum IS NOT NULL AND v_weight_sum > 0 THEN
      v_monthly := v_monthly || (v_weighted / v_weight_sum);
    ELSE
      v_monthly := v_monthly || NULL::numeric;
    END IF;
  END LOOP;

  IF v_agg = 'selected_months' AND array_length(v_selected,1) IS NOT NULL THEN
    FOR v_i IN 1..array_length(FY_MONTHS,1) LOOP
      IF FY_MONTHS[v_i] = ANY(v_selected) AND v_monthly[v_i] IS NOT NULL THEN
        v_chosen := v_chosen || v_monthly[v_i];
      END IF;
    END LOOP;
  ELSIF v_agg = 'last_n_months' AND v_last_n > 0 THEN
    FOR v_i IN GREATEST(1, 12 - v_last_n + 1)..12 LOOP
      IF v_monthly[v_i] IS NOT NULL THEN
        v_chosen := v_chosen || v_monthly[v_i];
      END IF;
    END LOOP;
  ELSE
    FOR v_i IN 1..12 LOOP
      IF v_monthly[v_i] IS NOT NULL THEN
        v_chosen := v_chosen || v_monthly[v_i];
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_chosen,1) IS NULL OR array_length(v_chosen,1) = 0 THEN
    RETURN 0;
  END IF;

  SELECT AVG(x) INTO v_rating FROM unnest(v_chosen) x;

  RETURN ROUND(((v_rating / KPI_SCALE_MAX) * p_weight)::numeric, 2);
END
$function$;

GRANT EXECUTE ON FUNCTION public.compute_carry_kra_contribution(uuid,int,jsonb,numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.compute_carry_kra_contribution(uuid,int,jsonb,numeric) IS
  'ADR-140: DB SSOT mirror of TS carryKraScore.ts. Returns scaled contribution in percentage points.';

CREATE OR REPLACE FUNCTION public.hydrate_annual_review_system_scores(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst      public.annual_review_instances%ROWTYPE;
  v_cycle     public.annual_review_cycles%ROWTYPE;
  v_template  public.annual_review_templates%ROWTYPE;
  v_slots     jsonb;
  v_slot      jsonb;
  v_slot_id   text;
  v_source    text;
  v_weight    numeric;
  v_carry     jsonb;
  v_fy_start  int;
  v_result    jsonb;
  v_contrib   numeric;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  SELECT * INTO v_cycle FROM public.annual_review_cycles WHERE id = v_inst.cycle_id;
  SELECT * INTO v_template FROM public.annual_review_templates
   WHERE id = COALESCE(v_inst.template_override_id, v_inst.template_id);

  v_result := COALESCE(v_inst.system_scores, '{}'::jsonb);
  v_slots  := v_template.sections->'system_scores';

  IF v_slots IS NULL OR jsonb_typeof(v_slots) <> 'array' OR jsonb_array_length(v_slots) = 0 THEN
    RETURN v_result;
  END IF;

  v_fy_start := v_cycle.review_year - 1;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots) LOOP
    v_slot_id := v_slot->>'id';
    v_source  := COALESCE(v_slot->>'source', 'manual');
    v_weight  := COALESCE((v_slot->>'weight')::numeric, 0);
    IF v_slot_id IS NULL OR v_weight <= 0 THEN CONTINUE; END IF;

    IF v_source = 'carry_kra' THEN
      v_carry := v_slot->'carry_config';
      v_contrib := public.compute_carry_kra_contribution(
        v_inst.employee_id, v_fy_start, v_carry, v_weight
      );
      -- Monotonic guard: never lower a persisted higher value silently.
      IF (v_result ? v_slot_id)
         AND (v_result->>v_slot_id) IS NOT NULL
         AND ((v_result->>v_slot_id)::numeric) > COALESCE(v_contrib, 0) THEN
        CONTINUE;
      END IF;
      v_result := v_result || jsonb_build_object(v_slot_id, COALESCE(v_contrib, 0));
    ELSE
      IF NOT (v_result ? v_slot_id) THEN
        v_result := v_result || jsonb_build_object(v_slot_id, NULL);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.annual_review_instances
     SET system_scores = v_result,
         updated_at    = now()
   WHERE id = p_instance_id;

  RETURN v_result;
END
$function$;

GRANT EXECUTE ON FUNCTION public.hydrate_annual_review_system_scores(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.hydrate_annual_review_system_scores(uuid) IS
  'ADR-140: SSOT. Resolves system_scores from template + monthly KRA and persists onto instance. Idempotent.';

CREATE OR REPLACE FUNCTION public.advance_annual_review_status(p_instance_id uuid, p_reviewer_role annual_reviewer_role)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_effective jsonb;
  v_skipped jsonb;
  v_next public.annual_review_status;
  v_orig_enabled jsonb;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
  v_weighted numeric;
  v_summary  RECORD;
  v_terminal_role text;
  v_terminal_reviewer uuid;
  v_src_row public.annual_review_responses%ROWTYPE;
  v_sys_cfg jsonb;
  v_sys_total_weight numeric := 0;
  v_slot jsonb;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF v_inst.overall_status = 'excluded' THEN
    RAISE EXCEPTION 'instance is excluded from this cycle and cannot be submitted';
  END IF;

  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'self'         AND (v_inst.employee_id  <> v_caller OR v_inst.overall_status <> 'pending_self')) OR
       (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip')) OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept')) OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu')) OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr')) OR
       (p_reviewer_role = 'management'   AND (v_inst.management_id<> v_caller OR v_inst.overall_status <> 'pending_management'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_weighted := public.compute_annual_review_weighted_score(p_instance_id, p_reviewer_role);

  UPDATE public.annual_review_responses
     SET is_locked = true,
         submitted_at = COALESCE(submitted_at, now()),
         weighted_score = COALESCE(v_weighted, weighted_score)
   WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role;

  v_effective    := public.annual_review_effective_chain(p_instance_id);
  v_orig_enabled := v_inst.enabled_stages;
  v_next         := public.annual_review_next_status(v_effective, v_inst.overall_status);

  IF v_orig_enabled <> v_effective THEN
    SELECT jsonb_agg(jsonb_build_object(
             'stage', stage,
             'reviewer_id', reviewer_id,
             'reason', skip_reason,
             'duplicate_of', duplicate_of))
      INTO v_skipped
      FROM public.annual_review_effective_chain_details(p_instance_id)
     WHERE skipped;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.stage_auto_skipped', v_caller, jsonb_build_object(
      'instance_id',     p_instance_id,
      'from_stage',      p_reviewer_role,
      'enabled',         v_orig_enabled,
      'effective',       v_effective,
      'skipped_stages',  COALESCE(v_skipped, '[]'::jsonb),
      'resolved_to',     v_next
    ));
  END IF;

  IF v_next = 'completed' THEN
    SELECT stage::text INTO v_terminal_role
      FROM public.annual_review_effective_chain_details(p_instance_id) d
      JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6),('management',7)) t(s, ord)
        ON t.s = d.stage::text
     WHERE NOT d.skipped
     ORDER BY ord DESC
     LIMIT 1;

    IF v_terminal_role IS NOT NULL AND v_terminal_role <> p_reviewer_role::text THEN
      v_terminal_reviewer := CASE v_terminal_role
        WHEN 'manager'      THEN v_inst.manager_id
        WHEN 'skip_manager' THEN v_inst.skip_id
        WHEN 'dept_head'    THEN v_inst.dept_head_id
        WHEN 'bu_head'      THEN v_inst.bu_head_id
        WHEN 'hr'           THEN v_inst.hr_id
        WHEN 'management'   THEN v_inst.management_id
        ELSE NULL
      END;

      IF v_terminal_reviewer IS NULL OR v_terminal_reviewer <> v_caller THEN
        RAISE EXCEPTION 'ADR-137: cannot mirror % submission to terminal stage % — terminal reviewer differs from caller',
          p_reviewer_role, v_terminal_role
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT * INTO v_src_row
        FROM public.annual_review_responses
       WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role
       LIMIT 1;

      INSERT INTO public.annual_review_responses (
        instance_id, reviewer_role, reviewer_id,
        criteria_scores, weighted_score, comments,
        is_locked, submitted_at
      )
      VALUES (
        p_instance_id, v_terminal_role::public.annual_reviewer_role, v_caller,
        COALESCE(v_src_row.criteria_scores, '{}'::jsonb),
        v_src_row.weighted_score,
        v_src_row.comments,
        true, now()
      )
      ON CONFLICT (instance_id, reviewer_role) DO UPDATE
        SET reviewer_id     = EXCLUDED.reviewer_id,
            criteria_scores = EXCLUDED.criteria_scores,
            weighted_score  = EXCLUDED.weighted_score,
            comments        = COALESCE(public.annual_review_responses.comments, EXCLUDED.comments),
            is_locked       = true,
            submitted_at    = COALESCE(public.annual_review_responses.submitted_at, now());

      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES ('annual_review.duplicate_reviewer_mirror', v_caller, jsonb_build_object(
        'instance_id',  p_instance_id,
        'from_role',    p_reviewer_role,
        'to_role',      v_terminal_role,
        'reviewer_id',  v_caller
      ));
    END IF;
  END IF;

  IF v_next = 'completed'
     AND v_inst.criteria_weighted_score IS NULL THEN

    PERFORM public.hydrate_annual_review_system_scores(p_instance_id);

    SELECT t.sections->'system_scores' INTO v_sys_cfg
      FROM public.annual_review_templates t
     WHERE t.id = COALESCE(v_inst.template_override_id, v_inst.template_id);

    IF v_sys_cfg IS NOT NULL AND jsonb_typeof(v_sys_cfg) = 'array' THEN
      FOR v_slot IN SELECT * FROM jsonb_array_elements(v_sys_cfg) LOOP
        v_sys_total_weight := v_sys_total_weight + COALESCE((v_slot->>'weight')::numeric, 0);
      END LOOP;
    END IF;

    SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;

    IF v_sys_total_weight > 0
       AND (v_inst.system_scores IS NULL
            OR v_inst.system_scores = '{}'::jsonb
            OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(v_inst.system_scores) e
               WHERE e.value IS NOT NULL
                 AND jsonb_typeof(e.value) = 'number'
                 AND (e.value)::text::numeric > 0
            ))
       AND COALESCE(v_weighted, 0) = 0 THEN
      RAISE EXCEPTION
        'ADR-140: cannot finalize instance % — template requires system scores (weight=%) but no monthly KRA data resolved. Verify monthly KPI data before submitting.',
        p_instance_id, v_sys_total_weight
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_summary
      FROM public.annual_review_compute_final_summary(p_instance_id);

    UPDATE public.annual_review_instances
       SET overall_status           = v_next,
           finalized_at             = now(),
           finalized_by             = v_caller,
           criteria_weighted_score  = v_summary.criteria_weighted_score,
           total_score              = v_summary.total_score,
           final_rating             = v_summary.final_rating,
           updated_at               = now()
     WHERE id = p_instance_id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.terminal_auto_finalized', v_caller, jsonb_build_object(
      'instance_id',              p_instance_id,
      'terminal_stage',           p_reviewer_role,
      'criteria_weighted_score',  v_summary.criteria_weighted_score,
      'total_score',              v_summary.total_score,
      'final_rating',             v_summary.final_rating,
      'system_scores',            v_inst.system_scores
    ));
  ELSE
    UPDATE public.annual_review_instances
       SET overall_status = v_next,
           finalized_at = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_at, now()) ELSE finalized_at END,
           finalized_by = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_by, v_caller) ELSE finalized_by END,
           updated_at = now()
     WHERE id = p_instance_id;
  END IF;

  RETURN v_next;
END $function$;

-- Repair: re-hydrate + recompute for previously mis-finalized instances
DO $repair$
DECLARE
  v_rec        RECORD;
  v_before_ss  jsonb;
  v_before_ts  numeric;
  v_before_cws numeric;
  v_before_fr  text;
  v_summary    RECORD;
  v_count      int := 0;
  v_skipped    int := 0;
BEGIN
  FOR v_rec IN
    SELECT i.id
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t
        ON t.id = COALESCE(i.template_override_id, i.template_id)
     WHERE i.overall_status = 'completed'
       AND (i.system_scores IS NULL OR i.system_scores = '{}'::jsonb)
       AND jsonb_typeof(t.sections->'system_scores') = 'array'
       AND jsonb_array_length(t.sections->'system_scores') > 0
  LOOP
    SELECT system_scores, total_score, criteria_weighted_score, final_rating
      INTO v_before_ss, v_before_ts, v_before_cws, v_before_fr
      FROM public.annual_review_instances WHERE id = v_rec.id;

    BEGIN
      PERFORM public.hydrate_annual_review_system_scores(v_rec.id);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    SELECT * INTO v_summary FROM public.annual_review_compute_final_summary(v_rec.id);

    IF v_summary.total_score IS NULL
       OR (COALESCE(v_before_ts,0) > 0 AND v_summary.total_score < v_before_ts) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.annual_review_instances
       SET criteria_weighted_score = v_summary.criteria_weighted_score,
           total_score             = v_summary.total_score,
           final_rating            = v_summary.final_rating,
           updated_at              = now()
     WHERE id = v_rec.id;

    INSERT INTO public.annual_review_final_backfill_audit_2026_07(
      instance_id,
      old_criteria_weighted_score, old_total_score, old_final_rating,
      new_criteria_weighted_score, new_total_score, new_final_rating,
      source
    )
    VALUES (
      v_rec.id,
      v_before_cws, v_before_ts, v_before_fr,
      v_summary.criteria_weighted_score, v_summary.total_score, v_summary.final_rating,
      'ADR-140 hydration repair'
    );

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.adr140_repair', NULL, jsonb_build_object(
    'repaired', v_count,
    'skipped',  v_skipped
  ));
END
$repair$;

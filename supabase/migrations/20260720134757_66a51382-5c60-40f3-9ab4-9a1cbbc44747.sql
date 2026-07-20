
-- =========================================================================
-- ADR-124 — Annual review terminal completion persistence
-- =========================================================================

-- 1) Audit snapshot table for the one-shot backfill (reversible)
CREATE TABLE IF NOT EXISTS public.annual_review_final_backfill_audit_2026_07 (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                   uuid NOT NULL,
  old_criteria_weighted_score   numeric,
  old_total_score               numeric,
  old_final_rating              text,
  new_criteria_weighted_score   numeric,
  new_total_score               numeric,
  new_final_rating              text,
  source                        text NOT NULL DEFAULT 'adr124_backfill',
  created_at                    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_final_backfill_audit_2026_07 TO authenticated;
GRANT ALL    ON public.annual_review_final_backfill_audit_2026_07 TO service_role;
ALTER TABLE public.annual_review_final_backfill_audit_2026_07 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adr124_audit_admin_read"
  ON public.annual_review_final_backfill_audit_2026_07;
CREATE POLICY "adr124_audit_admin_read"
  ON public.annual_review_final_backfill_audit_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

-- 2) Rating-band resolver: reads override from annual_review_settings if present,
--    else applies the ADR-124 defaults (Outstanding ≥85, Good ≥70, Average ≥55, Poor <55).
CREATE OR REPLACE FUNCTION public.annual_review_resolve_final_rating(p_total_score numeric)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_cfg  jsonb;
  v_band jsonb;
  v_min  numeric;
  v_lbl  text;
BEGIN
  IF p_total_score IS NULL OR NOT (p_total_score = p_total_score) THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_cfg
    FROM public.annual_review_settings
   WHERE key = 'auto_final_rating_thresholds'
   LIMIT 1;

  IF v_cfg IS NULL OR jsonb_typeof(v_cfg) <> 'array' THEN
    v_cfg := '[
      {"min":85,"label":"Outstanding"},
      {"min":70,"label":"Good"},
      {"min":55,"label":"Average"},
      {"min":0, "label":"Poor"}
    ]'::jsonb;
  END IF;

  FOR v_band IN
    SELECT * FROM jsonb_array_elements(v_cfg)
     ORDER BY ((value->>'min')::numeric) DESC
  LOOP
    v_min := NULLIF(v_band->>'min','')::numeric;
    v_lbl := v_band->>'label';
    IF v_min IS NOT NULL AND v_lbl IS NOT NULL AND p_total_score >= v_min THEN
      RETURN v_lbl;
    END IF;
  END LOOP;
  RETURN 'Poor';
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_resolve_final_rating(numeric)
  TO authenticated, service_role;

-- Seed the settings row (idempotent) so admins can find & edit it.
INSERT INTO public.annual_review_settings(key, value)
  SELECT 'auto_final_rating_thresholds',
         '[
            {"min":85,"label":"Outstanding"},
            {"min":70,"label":"Good"},
            {"min":55,"label":"Average"},
            {"min":0, "label":"Poor"}
          ]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.annual_review_settings WHERE key='auto_final_rating_thresholds'
  );

-- 3) SSOT compute helper — mirrors HR's finalize math:
--      criteria_weighted_score = raw Σ(weight × selected_score) from terminal reviewer
--                                (cascade high→low across effective chain until one found)
--      total_score             = LEAST(100, Σ system_scores + criteria_weighted_score)
--      final_rating            = annual_review_resolve_final_rating(total_score)
--
--    Returned as a composite so callers can UPDATE in one shot.
DROP FUNCTION IF EXISTS public.annual_review_compute_final_summary(uuid);
CREATE OR REPLACE FUNCTION public.annual_review_compute_final_summary(p_instance_id uuid)
RETURNS TABLE (
  criteria_weighted_score numeric,
  total_score             numeric,
  final_rating            text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_inst          public.annual_review_instances%ROWTYPE;
  v_effective     jsonb;
  v_criteria      jsonb;
  v_role          text;
  v_high_to_low   text[] := ARRAY['hr','bu_head','dept_head','skip_manager','manager','self'];
  v_scores        jsonb;
  v_crit          jsonb;
  v_wsum          numeric := 0;
  v_id            text;
  v_weight        numeric;
  v_score         numeric;
  v_sys_total     numeric := 0;
  v_sys_val       numeric;
  v_key           text;
  v_total         numeric;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Effective template criteria (override wins).
  SELECT t.sections->'criteria'
    INTO v_criteria
    FROM public.annual_review_templates t
   WHERE t.id = COALESCE(v_inst.template_override_id, v_inst.template_id);

  -- Effective chain (already-configured, non-skipped stages).
  v_effective := public.annual_review_effective_chain(p_instance_id);

  -- Cascade high→low across effective chain to find terminal reviewer.
  IF v_criteria IS NOT NULL AND jsonb_typeof(v_criteria) = 'array' THEN
    FOREACH v_role IN ARRAY v_high_to_low LOOP
      IF v_effective IS NULL OR NOT (v_effective ? v_role) THEN
        CONTINUE;
      END IF;

      SELECT r.criteria_scores
        INTO v_scores
        FROM public.annual_review_responses r
       WHERE r.instance_id = p_instance_id
         AND r.reviewer_role::text = v_role
         AND r.is_locked = true
       LIMIT 1;

      IF v_scores IS NULL THEN
        CONTINUE;
      END IF;

      v_wsum := 0;
      FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
        v_id     := v_crit->>'id';
        v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
        IF v_id IS NULL OR NOT (v_scores ? v_id) THEN CONTINUE; END IF;
        BEGIN
          v_score := (v_scores->>v_id)::numeric;
        EXCEPTION WHEN others THEN
          CONTINUE;
        END;
        IF v_score IS NULL THEN CONTINUE; END IF;
        v_wsum := v_wsum + (v_weight * v_score);
      END LOOP;

      criteria_weighted_score := v_wsum;
      EXIT;
    END LOOP;
  END IF;

  -- System scores sum (values are already in percentage points).
  IF v_inst.system_scores IS NOT NULL AND jsonb_typeof(v_inst.system_scores) = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_inst.system_scores) LOOP
      BEGIN
        v_sys_val := (v_inst.system_scores->>v_key)::numeric;
      EXCEPTION WHEN others THEN
        v_sys_val := NULL;
      END;
      IF v_sys_val IS NOT NULL THEN v_sys_total := v_sys_total + v_sys_val; END IF;
    END LOOP;
  END IF;

  IF criteria_weighted_score IS NULL AND v_sys_total = 0 THEN
    total_score  := NULL;
    final_rating := NULL;
  ELSE
    v_total := LEAST(100, v_sys_total + COALESCE(criteria_weighted_score, 0));
    total_score  := v_total;
    final_rating := public.annual_review_resolve_final_rating(v_total);
  END IF;

  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_compute_final_summary(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.annual_review_compute_final_summary(uuid) IS
'ADR-124 SSOT for the terminal summary of an annual review instance. Mirrors HR''s HrFinalizationSheet formula so auto-completed and HR-finalized instances agree.';

-- 4) Patch advance_annual_review_status to persist terminal summary when
--    transitioning into 'completed'. HR path (finalizeInstance) unchanged.
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
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr'))
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

  -- ADR-124: when the terminal stage is reached and HR has NOT already
  -- populated the final summary, compute + persist it here. HR still wins:
  -- if criteria_weighted_score is already non-NULL, we do not overwrite.
  IF v_next = 'completed'
     AND v_inst.criteria_weighted_score IS NULL THEN
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
      'final_rating',             v_summary.final_rating
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

-- 5) One-shot backfill of existing completed instances
DO $$
DECLARE
  r        RECORD;
  v_sum    RECORD;
  v_count  int := 0;
BEGIN
  FOR r IN
    SELECT id, criteria_weighted_score, total_score, final_rating
      FROM public.annual_review_instances
     WHERE overall_status = 'completed'
       AND (criteria_weighted_score IS NULL
            OR total_score IS NULL
            OR final_rating IS NULL)
  LOOP
    SELECT * INTO v_sum FROM public.annual_review_compute_final_summary(r.id);

    -- Skip if compute produced nothing usable.
    IF v_sum.criteria_weighted_score IS NULL AND v_sum.total_score IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.annual_review_final_backfill_audit_2026_07(
      instance_id,
      old_criteria_weighted_score, old_total_score, old_final_rating,
      new_criteria_weighted_score, new_total_score, new_final_rating
    ) VALUES (
      r.id,
      r.criteria_weighted_score, r.total_score, r.final_rating,
      v_sum.criteria_weighted_score, v_sum.total_score, v_sum.final_rating
    );

    UPDATE public.annual_review_instances
       SET criteria_weighted_score = COALESCE(criteria_weighted_score, v_sum.criteria_weighted_score),
           total_score             = COALESCE(total_score, v_sum.total_score),
           final_rating            = COALESCE(final_rating, v_sum.final_rating),
           updated_at              = now()
     WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.adr124_backfill', NULL, jsonb_build_object(
    'rows_backfilled', v_count,
    'ran_at',          now()
  ));
END $$;

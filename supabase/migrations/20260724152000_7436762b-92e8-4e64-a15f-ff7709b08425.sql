
-- ============================================================================
-- ADR-161 — Post-June KRA Rehydrate for Completed Annual Reviews
-- ============================================================================

-- 1) Audit runs -------------------------------------------------------------
CREATE TABLE public.annual_review_kra_rehydrate_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run','apply','rollback')),
  reason text NOT NULL CHECK (char_length(reason) >= 10),
  rollback_of_run_id uuid REFERENCES public.annual_review_kra_rehydrate_runs(id),
  instance_ids uuid[] NULL,
  instance_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

GRANT SELECT, INSERT, UPDATE ON public.annual_review_kra_rehydrate_runs TO authenticated;
GRANT ALL ON public.annual_review_kra_rehydrate_runs TO service_role;

ALTER TABLE public.annual_review_kra_rehydrate_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kra_rehydrate_runs_admin_read"
  ON public.annual_review_kra_rehydrate_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "kra_rehydrate_runs_admin_write"
  ON public.annual_review_kra_rehydrate_runs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE INDEX idx_kra_rehydrate_runs_cycle ON public.annual_review_kra_rehydrate_runs(cycle_id, created_at DESC);


-- 2) Per-instance diff snapshots -------------------------------------------
CREATE TABLE public.annual_review_kra_rehydrate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.annual_review_kra_rehydrate_runs(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  template_id uuid NULL,
  old_system_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  old_system_scores_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  old_total_score numeric(6,2) NULL,
  old_final_rating text NULL,
  new_system_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_total_score numeric(6,2) NULL,
  new_final_rating text NULL,
  delta_total numeric(6,2) NULL,
  band_changed boolean NOT NULL DEFAULT false,
  applied boolean NOT NULL DEFAULT false,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_kra_rehydrate_items TO authenticated;
GRANT ALL ON public.annual_review_kra_rehydrate_items TO service_role;

ALTER TABLE public.annual_review_kra_rehydrate_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kra_rehydrate_items_admin_read"
  ON public.annual_review_kra_rehydrate_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "kra_rehydrate_items_admin_write"
  ON public.annual_review_kra_rehydrate_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE INDEX idx_kra_rehydrate_items_run ON public.annual_review_kra_rehydrate_items(run_id);
CREATE INDEX idx_kra_rehydrate_items_instance ON public.annual_review_kra_rehydrate_items(instance_id);


-- 3) Rehydrate RPC ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_rehydrate_kra_for_cycle(
  p_cycle_id uuid,
  p_mode text,
  p_reason text,
  p_instance_ids uuid[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id       uuid;
  v_uid          uuid := auth.uid();
  v_fy_start     int;
  v_review_year  int;
  v_inst         record;
  v_tpl_sections jsonb;
  v_slot         jsonb;
  v_new_scores   jsonb;
  v_new_total    numeric;
  v_new_rating   text;
  v_slot_value   numeric;
  v_slot_id      text;
  v_delta        numeric;
  v_changed      boolean;
  v_instance_ct  int := 0;
  v_changed_ct   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'admin or hr_pms role required';
  END IF;
  IF p_mode NOT IN ('dry_run','apply') THEN
    RAISE EXCEPTION 'invalid mode %, expected dry_run or apply', p_mode;
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason must be at least 10 characters';
  END IF;

  SELECT review_year INTO v_review_year
    FROM public.annual_review_cycles WHERE id = p_cycle_id;
  IF v_review_year IS NULL THEN
    RAISE EXCEPTION 'cycle % not found', p_cycle_id;
  END IF;
  v_fy_start := v_review_year - 1;  -- July fy start

  INSERT INTO public.annual_review_kra_rehydrate_runs
    (cycle_id, initiated_by, mode, reason, instance_ids, status)
  VALUES (p_cycle_id, v_uid, p_mode, p_reason, p_instance_ids, 'running')
  RETURNING id INTO v_run_id;

  FOR v_inst IN
    SELECT i.id, i.employee_id, i.template_id, i.template_override_id,
           i.system_scores, i.system_scores_raw, i.total_score, i.final_rating,
           COALESCE(t_over.sections, t.sections) AS sections,
           COALESCE(i.template_override_id, i.template_id) AS effective_template_id
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t ON t.id = i.template_id
      LEFT JOIN public.annual_review_templates t_over ON t_over.id = i.template_override_id
     WHERE i.cycle_id = p_cycle_id
       AND i.overall_status = 'completed'
       AND (p_instance_ids IS NULL OR i.id = ANY(p_instance_ids))
       AND COALESCE(t_over.sections, t.sections)->'system_scores' @> '[{"source":"carry_kra"}]'::jsonb
  LOOP
    v_instance_ct := v_instance_ct + 1;
    v_tpl_sections := v_inst.sections;
    v_new_scores := COALESCE(v_inst.system_scores, '{}'::jsonb);

    -- Recompute every carry_kra slot; leave other slots untouched.
    FOR v_slot IN
      SELECT * FROM jsonb_array_elements(v_tpl_sections->'system_scores')
    LOOP
      IF (v_slot->>'source') = 'carry_kra' THEN
        v_slot_id := v_slot->>'id';
        v_slot_value := public.compute_carry_kra_contribution(
          v_inst.employee_id,
          v_fy_start,
          COALESCE(v_slot->'carry_config', '{"aggregation":"overall_avg","excludeNa":true}'::jsonb),
          COALESCE((v_slot->>'weight')::numeric, 0)
        );
        v_new_scores := jsonb_set(v_new_scores, ARRAY[v_slot_id], to_jsonb(v_slot_value), true);
      END IF;
    END LOOP;

    -- Sum all numeric values in the new system_scores map, clamp to [0,100].
    SELECT COALESCE(SUM((value)::numeric), 0)
      INTO v_new_total
      FROM jsonb_each_text(v_new_scores)
     WHERE value ~ '^-?[0-9]+(\.[0-9]+)?$';
    v_new_total := LEAST(100, GREATEST(0, ROUND(v_new_total, 2)));
    v_new_rating := public.annual_review_resolve_final_rating(v_new_total);

    v_delta := v_new_total - COALESCE(v_inst.total_score, 0);
    v_changed := (
      COALESCE(v_inst.total_score, -1) <> v_new_total
      OR COALESCE(v_inst.final_rating, '') <> COALESCE(v_new_rating, '')
      OR COALESCE(v_inst.system_scores, '{}'::jsonb) <> v_new_scores
    );

    INSERT INTO public.annual_review_kra_rehydrate_items
      (run_id, instance_id, employee_id, template_id,
       old_system_scores, old_system_scores_raw, old_total_score, old_final_rating,
       new_system_scores, new_total_score, new_final_rating,
       delta_total, band_changed, applied)
    VALUES
      (v_run_id, v_inst.id, v_inst.employee_id, v_inst.effective_template_id,
       COALESCE(v_inst.system_scores, '{}'::jsonb),
       COALESCE(v_inst.system_scores_raw, '{}'::jsonb),
       v_inst.total_score, v_inst.final_rating,
       v_new_scores, v_new_total, v_new_rating,
       v_delta,
       COALESCE(v_inst.final_rating,'') <> COALESCE(v_new_rating,''),
       (p_mode = 'apply' AND v_changed));

    IF v_changed THEN
      v_changed_ct := v_changed_ct + 1;
      IF p_mode = 'apply' THEN
        UPDATE public.annual_review_instances
           SET system_scores = v_new_scores,
               total_score   = v_new_total,
               final_rating  = v_new_rating,
               updated_at    = now()
         WHERE id = v_inst.id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.annual_review_kra_rehydrate_runs
     SET instance_count = v_instance_ct,
         changed_count  = v_changed_ct,
         status         = 'completed',
         completed_at   = now()
   WHERE id = v_run_id;

  -- Best-effort audit log entry.
  BEGIN
    INSERT INTO public.annual_review_access_audit
      (actor_id, action, target_kind, target_id, details, created_at)
    VALUES
      (v_uid,
       CASE WHEN p_mode='apply' THEN 'annual_review.kra_rehydrate_applied'
            ELSE 'annual_review.kra_rehydrate_dry_run' END,
       'cycle', p_cycle_id,
       jsonb_build_object(
         'run_id', v_run_id,
         'mode', p_mode,
         'instance_count', v_instance_ct,
         'changed_count', v_changed_ct,
         'reason', p_reason
       ),
       now());
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_run_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.annual_review_kra_rehydrate_runs
     SET status='failed', error_message=SQLERRM, completed_at=now()
   WHERE id = v_run_id;
  RAISE;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_rehydrate_kra_for_cycle(uuid,text,text,uuid[]) TO authenticated;


-- 4) Rollback RPC ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_rollback_kra_rehydrate_run(
  p_run_id uuid,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       record;
  v_new_run   uuid;
  v_reverted  int := 0;
  v_count     int := 0;
  v_item      record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'admin or hr_pms role required';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason must be at least 10 characters';
  END IF;

  SELECT * INTO v_src FROM public.annual_review_kra_rehydrate_runs WHERE id = p_run_id;
  IF v_src IS NULL THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_src.mode <> 'apply' THEN RAISE EXCEPTION 'only apply runs can be rolled back'; END IF;

  INSERT INTO public.annual_review_kra_rehydrate_runs
    (cycle_id, initiated_by, mode, reason, rollback_of_run_id, status)
  VALUES (v_src.cycle_id, v_uid, 'rollback', p_reason, p_run_id, 'running')
  RETURNING id INTO v_new_run;

  FOR v_item IN
    SELECT * FROM public.annual_review_kra_rehydrate_items
     WHERE run_id = p_run_id AND applied = true
  LOOP
    v_count := v_count + 1;
    UPDATE public.annual_review_instances
       SET system_scores     = v_item.old_system_scores,
           system_scores_raw = v_item.old_system_scores_raw,
           total_score       = v_item.old_total_score,
           final_rating      = v_item.old_final_rating,
           updated_at        = now()
     WHERE id = v_item.instance_id;

    INSERT INTO public.annual_review_kra_rehydrate_items
      (run_id, instance_id, employee_id, template_id,
       old_system_scores, old_system_scores_raw, old_total_score, old_final_rating,
       new_system_scores, new_total_score, new_final_rating,
       delta_total, band_changed, applied, note)
    VALUES
      (v_new_run, v_item.instance_id, v_item.employee_id, v_item.template_id,
       v_item.new_system_scores, '{}'::jsonb, v_item.new_total_score, v_item.new_final_rating,
       v_item.old_system_scores, v_item.old_total_score, v_item.old_final_rating,
       COALESCE(v_item.old_total_score,0) - COALESCE(v_item.new_total_score,0),
       COALESCE(v_item.old_final_rating,'') <> COALESCE(v_item.new_final_rating,''),
       true,
       'rollback of run ' || p_run_id::text);
    v_reverted := v_reverted + 1;
  END LOOP;

  UPDATE public.annual_review_kra_rehydrate_runs
     SET instance_count = v_count, changed_count = v_reverted,
         status = 'completed', completed_at = now()
   WHERE id = v_new_run;

  BEGIN
    INSERT INTO public.annual_review_access_audit
      (actor_id, action, target_kind, target_id, details, created_at)
    VALUES
      (v_uid, 'annual_review.kra_rehydrate_rolled_back', 'run', p_run_id,
       jsonb_build_object('new_run_id', v_new_run, 'reverted', v_reverted, 'reason', p_reason),
       now());
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_new_run;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.annual_review_kra_rehydrate_runs
     SET status='failed', error_message=SQLERRM, completed_at=now()
   WHERE id = v_new_run;
  RAISE;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_rollback_kra_rehydrate_run(uuid,text) TO authenticated;

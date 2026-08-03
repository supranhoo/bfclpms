-- ADR-234 / POLICY §AR-SYSTEM-SCORE-TEMPLATE-SCOPE
-- 1) Template-scoped system score summation inside the sanctioned writer.
CREATE OR REPLACE FUNCTION public.annual_review_compute_final_summary(p_instance_id uuid)
 RETURNS TABLE(criteria_weighted_score numeric, total_score numeric, final_rating text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst              public.annual_review_instances%ROWTYPE;
  v_effective         jsonb;
  v_sections          jsonb;
  v_criteria          jsonb;
  v_system_cfg        jsonb;
  v_role              text;
  v_high_to_low       text[] := ARRAY['hr','bu_head','dept_head','skip_manager','manager','self'];
  v_scores            jsonb;
  v_crit              jsonb;
  v_id                text;
  v_weight            numeric;
  v_score             numeric;
  v_wsum              numeric := 0;
  v_criteria_raw_max  numeric := 0;
  v_system_max_raw    numeric := 0;
  v_criteria_pool_max numeric := 0;
  v_sys_total         numeric := 0;
  v_sys_val           numeric;
  v_key               text;
  v_slot_ids          text[] := ARRAY[]::text[];
  v_criteria_pool_pts numeric := 0;
  v_total             numeric;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT t.sections INTO v_sections
    FROM public.annual_review_templates t
   WHERE t.id = COALESCE(v_inst.template_override_id, v_inst.template_id);

  v_criteria   := v_sections->'criteria';
  v_system_cfg := v_sections->'system_scores';

  IF v_criteria IS NOT NULL AND jsonb_typeof(v_criteria) = 'array' THEN
    FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
      v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
      IF v_weight > 0 THEN
        v_criteria_raw_max := v_criteria_raw_max + (v_weight * 5);
      END IF;
    END LOOP;
  END IF;

  IF v_system_cfg IS NOT NULL AND jsonb_typeof(v_system_cfg) = 'array' THEN
    FOR v_crit IN SELECT * FROM jsonb_array_elements(v_system_cfg) LOOP
      v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
      IF v_weight > 0 THEN
        v_system_max_raw := v_system_max_raw + v_weight;
      END IF;
      IF NULLIF(v_crit->>'id','') IS NOT NULL THEN
        v_slot_ids := array_append(v_slot_ids, v_crit->>'id');
      END IF;
    END LOOP;
  END IF;
  v_criteria_pool_max := GREATEST(0, LEAST(100, 100 - v_system_max_raw));

  v_effective := public.annual_review_effective_chain(p_instance_id);

  IF v_criteria IS NOT NULL AND jsonb_typeof(v_criteria) = 'array' THEN
    FOREACH v_role IN ARRAY v_high_to_low LOOP
      IF v_effective IS NULL OR NOT (v_effective ? v_role) THEN CONTINUE; END IF;

      SELECT r.criteria_scores INTO v_scores
        FROM public.annual_review_responses r
       WHERE r.instance_id = p_instance_id
         AND r.reviewer_role::text = v_role
         AND r.is_locked = true
       LIMIT 1;

      IF v_scores IS NULL THEN CONTINUE; END IF;

      v_wsum := 0;
      FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
        v_id     := v_crit->>'id';
        v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
        IF v_id IS NULL OR NOT (v_scores ? v_id) THEN CONTINUE; END IF;
        BEGIN v_score := (v_scores->>v_id)::numeric;
        EXCEPTION WHEN others THEN CONTINUE;
        END;
        IF v_score IS NULL THEN CONTINUE; END IF;
        v_wsum := v_wsum + (v_weight * v_score);
      END LOOP;

      criteria_weighted_score := v_wsum;
      EXIT;
    END LOOP;
  END IF;

  -- ADR-234: only slots declared by the EFFECTIVE template contribute points.
  IF v_inst.system_scores IS NOT NULL AND jsonb_typeof(v_inst.system_scores) = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_inst.system_scores) LOOP
      IF NOT (v_key = ANY (v_slot_ids)) THEN CONTINUE; END IF;
      BEGIN v_sys_val := (v_inst.system_scores->>v_key)::numeric;
      EXCEPTION WHEN others THEN v_sys_val := NULL;
      END;
      IF v_sys_val IS NOT NULL THEN v_sys_total := v_sys_total + v_sys_val; END IF;
    END LOOP;
  END IF;

  IF criteria_weighted_score IS NOT NULL AND v_criteria_raw_max > 0 THEN
    v_criteria_pool_pts := (criteria_weighted_score / v_criteria_raw_max) * v_criteria_pool_max;
  ELSIF criteria_weighted_score IS NOT NULL AND v_criteria_raw_max = 0 THEN
    v_criteria_pool_pts := criteria_weighted_score;
  ELSE
    v_criteria_pool_pts := 0;
  END IF;

  IF criteria_weighted_score IS NULL AND v_sys_total = 0 THEN
    total_score  := NULL;
    final_rating := NULL;
  ELSE
    v_total := GREATEST(0, LEAST(100, v_sys_total + v_criteria_pool_pts));
    total_score  := ROUND(v_total::numeric, 4);
    final_rating := public.annual_review_resolve_final_rating(v_total);
  END IF;

  RETURN NEXT;
END $function$;

-- 2) Orphan-key diagnostic (admin / hr_pms only).
CREATE OR REPLACE FUNCTION public.annual_review_orphan_system_scores(p_cycle_id uuid DEFAULT NULL)
 RETURNS TABLE(
   instance_id uuid,
   employee_id uuid,
   employee_code text,
   employee_name text,
   template_name text,
   overall_status text,
   orphan_keys text[],
   orphan_points numeric,
   total_score numeric,
   expected_total_score numeric
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT i.id, i.employee_id, i.system_scores, i.total_score AS ts,
           i.overall_status::text AS st, t.name AS tname, t.sections AS sections
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t
        ON t.id = COALESCE(i.template_override_id, i.template_id)
     WHERE (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
  ), orph AS (
    SELECT b.*, (
      SELECT array_agg(k) FROM jsonb_object_keys(COALESCE(b.system_scores,'{}'::jsonb)) k
       WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(b.sections->'system_scores','[]'::jsonb)) s
          WHERE s->>'id' = k)
    ) AS keys, (
      SELECT COALESCE(SUM((b.system_scores->>k)::numeric),0)
        FROM jsonb_object_keys(COALESCE(b.system_scores,'{}'::jsonb)) k
       WHERE NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(b.sections->'system_scores','[]'::jsonb)) s
          WHERE s->>'id' = k)
    ) AS pts
    FROM base b
  )
  SELECT o.id, o.employee_id, p.employee_code, p.full_name, o.tname, o.st,
         o.keys, o.pts, o.ts, f.total_score
    FROM orph o
    JOIN public.profiles p ON p.id = o.employee_id
    CROSS JOIN LATERAL public.annual_review_compute_final_summary(o.id) f
   WHERE o.keys IS NOT NULL AND array_length(o.keys, 1) > 0;
END $function$;

GRANT EXECUTE ON FUNCTION public.annual_review_orphan_system_scores(uuid) TO authenticated;

-- 3) Audited prune + recompute repair (admin only).
CREATE OR REPLACE FUNCTION public.annual_review_prune_orphan_system_scores(
  p_cycle_id uuid,
  p_reason text,
  p_dry_run boolean DEFAULT true
)
 RETURNS TABLE(
   instance_id uuid,
   employee_code text,
   removed_keys text[],
   removed_points numeric,
   old_total_score numeric,
   new_total_score numeric,
   old_final_rating text,
   new_final_rating text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r         record;
  v_scores  jsonb;
  v_raw     jsonb;
  v_key     text;
  v_new_ts  numeric;
  v_new_fr  text;
  v_uid     uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Only admins can prune orphan system scores';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  FOR r IN
    SELECT * FROM public.annual_review_orphan_system_scores(p_cycle_id)
  LOOP
    v_scores := NULL; v_raw := NULL;
    SELECT i.system_scores, i.system_scores_raw INTO v_scores, v_raw
      FROM public.annual_review_instances i WHERE i.id = r.instance_id;

    FOREACH v_key IN ARRAY r.orphan_keys LOOP
      IF NOT p_dry_run THEN
        INSERT INTO public.annual_review_system_score_edits(
          instance_id, employee_id, slot_id, slot_name, overall_status,
          old_raw, new_raw, old_points, new_points,
          old_total_score, new_total_score, old_final_rating, new_final_rating,
          reason, edited_by)
        SELECT r.instance_id, r.employee_id, v_key, NULL, r.overall_status,
               NULLIF(v_raw->>v_key,'')::numeric, NULL,
               NULLIF(v_scores->>v_key,'')::numeric, NULL,
               r.total_score, r.expected_total_score, i.final_rating, NULL,
               'ADR-234 orphan slot pruned: ' || p_reason, v_uid
          FROM public.annual_review_instances i WHERE i.id = r.instance_id;
      END IF;
      v_scores := v_scores - v_key;
      v_raw    := COALESCE(v_raw, '{}'::jsonb) - v_key;
    END LOOP;

    IF NOT p_dry_run THEN
      UPDATE public.annual_review_instances i
         SET system_scores = v_scores, system_scores_raw = v_raw
       WHERE i.id = r.instance_id;

      SELECT f.total_score, f.final_rating INTO v_new_ts, v_new_fr
        FROM public.annual_review_compute_final_summary(r.instance_id) f;

      UPDATE public.annual_review_instances i
         SET total_score = v_new_ts, final_rating = v_new_fr
       WHERE i.id = r.instance_id;
    ELSE
      v_new_ts := r.expected_total_score;
      SELECT f.final_rating INTO v_new_fr
        FROM public.annual_review_compute_final_summary(r.instance_id) f;
    END IF;

    instance_id     := r.instance_id;
    employee_code   := r.employee_code;
    removed_keys    := r.orphan_keys;
    removed_points  := r.orphan_points;
    old_total_score := r.total_score;
    new_total_score := v_new_ts;
    SELECT i.final_rating INTO old_final_rating
      FROM public.annual_review_instances i WHERE i.id = r.instance_id;
    new_final_rating := v_new_fr;
    RETURN NEXT;
  END LOOP;
END $function$;

GRANT EXECUTE ON FUNCTION public.annual_review_prune_orphan_system_scores(uuid, text, boolean) TO authenticated;

-- 4) Prune orphans automatically whenever the effective template changes.
CREATE OR REPLACE FUNCTION public.ar_prune_orphan_system_scores_on_template_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sections jsonb;
  v_key text;
BEGIN
  IF COALESCE(NEW.template_override_id, NEW.template_id) IS NOT DISTINCT FROM
     COALESCE(OLD.template_override_id, OLD.template_id) THEN
    RETURN NEW;
  END IF;

  SELECT t.sections INTO v_sections FROM public.annual_review_templates t
   WHERE t.id = COALESCE(NEW.template_override_id, NEW.template_id);
  IF v_sections IS NULL THEN RETURN NEW; END IF;

  FOR v_key IN
    SELECT k FROM jsonb_object_keys(COALESCE(NEW.system_scores, '{}'::jsonb)) k
     WHERE NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(v_sections->'system_scores','[]'::jsonb)) s
        WHERE s->>'id' = k)
  LOOP
    INSERT INTO public.annual_review_system_score_edits(
      instance_id, employee_id, slot_id, overall_status,
      old_raw, old_points, old_total_score, old_final_rating, reason, edited_by)
    VALUES (NEW.id, NEW.employee_id, v_key, NEW.overall_status::text,
      NULLIF(NEW.system_scores_raw->>v_key,'')::numeric,
      NULLIF(NEW.system_scores->>v_key,'')::numeric,
      OLD.total_score, OLD.final_rating,
      'ADR-234 auto-prune on template change', auth.uid());

    NEW.system_scores     := NEW.system_scores - v_key;
    NEW.system_scores_raw := COALESCE(NEW.system_scores_raw, '{}'::jsonb) - v_key;
  END LOOP;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_ar_prune_orphan_system_scores ON public.annual_review_instances;
CREATE TRIGGER trg_ar_prune_orphan_system_scores
  BEFORE UPDATE ON public.annual_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.ar_prune_orphan_system_scores_on_template_change();
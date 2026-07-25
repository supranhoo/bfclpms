
-- ADR-166 — Template Swap Remap Invariant + Balram Mahto (100002) targeted repair
-- POLICY §AR-TEMPLATE-SWAP-REMAP-INVARIANT

CREATE OR REPLACE FUNCTION public.find_orphan_criteria_scores(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (
  instance_id       uuid,
  employee_id       uuid,
  cycle_id          uuid,
  template_id       uuid,
  reviewer_role     annual_reviewer_role,
  response_id       uuid,
  stored_keys       text[],
  current_keys      text[],
  orphan_keys       text[],
  weighted_score    numeric,
  submitted_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH inst AS (
    SELECT i.id, i.employee_id, i.cycle_id,
           COALESCE(i.template_override_id, i.template_id) AS eff_template_id
      FROM public.annual_review_instances i
     WHERE (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
  ),
  cur AS (
    SELECT i.id AS iid,
           i.eff_template_id,
           ARRAY(
             SELECT c->>'id'
               FROM public.annual_review_templates t,
                    jsonb_array_elements(t.sections->'criteria') c
              WHERE t.id = i.eff_template_id
           ) AS current_keys
      FROM inst i
  ),
  resp AS (
    SELECT r.id AS rid,
           r.instance_id,
           r.reviewer_role,
           r.weighted_score,
           r.submitted_at,
           ARRAY(SELECT jsonb_object_keys(r.criteria_scores)) AS stored_keys
      FROM public.annual_review_responses r
     WHERE r.criteria_scores IS NOT NULL
       AND jsonb_typeof(r.criteria_scores) = 'object'
       AND r.criteria_scores <> '{}'::jsonb
       AND r.instance_id IN (SELECT id FROM inst)
  )
  SELECT i.id, i.employee_id, i.cycle_id, c.eff_template_id,
         r.reviewer_role, r.rid,
         r.stored_keys, c.current_keys,
         ARRAY(SELECT k FROM unnest(r.stored_keys) k WHERE NOT (k = ANY(c.current_keys))),
         r.weighted_score, r.submitted_at
    FROM inst i
    JOIN cur c  ON c.iid = i.id
    JOIN resp r ON r.instance_id = i.id
   WHERE EXISTS (
     SELECT 1 FROM unnest(r.stored_keys) k WHERE NOT (k = ANY(c.current_keys))
   );
END;
$$;

REVOKE ALL ON FUNCTION public.find_orphan_criteria_scores(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_orphan_criteria_scores(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.find_orphan_criteria_scores(uuid) IS
'ADR-166 diagnostic. Lists annual-review responses whose criteria_scores keys are not in the current template. Admin/hr_pms only.';

-- Auto-remap trigger on template change
CREATE OR REPLACE FUNCTION public.tg_ar_instance_template_change_remap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev uuid;
  v_new  uuid;
  rec    record;
BEGIN
  v_prev := COALESCE(OLD.template_override_id, OLD.template_id);
  v_new  := COALESCE(NEW.template_override_id, NEW.template_id);
  IF v_prev IS NULL OR v_new IS NULL OR v_prev = v_new THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.annual_review_rescore_audit_2026_07
    (response_id, instance_id, reviewer_role,
     previous_weighted_score, new_weighted_score,
     template_override_id, template_id)
  SELECT ar.id, NEW.id, ar.reviewer_role,
         ar.weighted_score, NULL,
         NEW.template_override_id, NEW.template_id
    FROM public.annual_review_responses ar
   WHERE ar.instance_id = NEW.id;

  PERFORM public.remap_annual_review_criteria_scores(NEW.id, v_prev);

  FOR rec IN
    SELECT id, reviewer_role
      FROM public.annual_review_responses
     WHERE instance_id = NEW.id
  LOOP
    UPDATE public.annual_review_responses
       SET weighted_score = public.compute_annual_review_weighted_score(NEW.id, rec.reviewer_role)
     WHERE id = rec.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_instance_template_change_remap ON public.annual_review_instances;
CREATE TRIGGER trg_ar_instance_template_change_remap
AFTER UPDATE OF template_id, template_override_id ON public.annual_review_instances
FOR EACH ROW
WHEN (
  COALESCE(OLD.template_override_id, OLD.template_id)
  IS DISTINCT FROM
  COALESCE(NEW.template_override_id, NEW.template_id)
)
EXECUTE FUNCTION public.tg_ar_instance_template_change_remap();

-- Balram Mahto (100002) targeted repair
DO $balram$
DECLARE
  v_instance uuid := '367cf7d5-fc19-474b-a1e8-82cf71eca3e2';
  v_template uuid;
  v_current_ids text[];
  rec RECORD;
  v_new_scores jsonb;
  v_uniform numeric;
  v_prev_weight numeric;
  v_new_weight numeric;
  v_terminal_weight numeric;
BEGIN
  SELECT COALESCE(template_override_id, template_id) INTO v_template
    FROM public.annual_review_instances WHERE id = v_instance;
  IF v_template IS NULL THEN
    RAISE NOTICE 'ADR-166 Balram repair: instance not found, skipping.';
    RETURN;
  END IF;

  SELECT array_agg(c->>'id')
    INTO v_current_ids
    FROM public.annual_review_templates t,
         jsonb_array_elements(t.sections->'criteria') c
   WHERE t.id = v_template;

  FOR rec IN
    SELECT id, reviewer_role, criteria_scores, weighted_score
      FROM public.annual_review_responses
     WHERE instance_id = v_instance
  LOOP
    v_prev_weight := rec.weighted_score;

    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(rec.criteria_scores) k
       WHERE NOT (k = ANY(v_current_ids))
    ) THEN
      SELECT (v.value)::numeric INTO v_uniform
        FROM jsonb_each(rec.criteria_scores) v
       GROUP BY v.value
       ORDER BY count(*) DESC
       LIMIT 1;

      SELECT COALESCE(jsonb_object_agg(cid, v_uniform), '{}'::jsonb)
        INTO v_new_scores
        FROM unnest(v_current_ids) cid;

      UPDATE public.annual_review_responses
         SET criteria_scores = v_new_scores,
             updated_at      = now()
       WHERE id = rec.id;
    END IF;

    v_new_weight := public.compute_annual_review_weighted_score(v_instance, rec.reviewer_role);
    UPDATE public.annual_review_responses
       SET weighted_score = v_new_weight
     WHERE id = rec.id;

    INSERT INTO public.annual_review_rescore_audit_2026_07
      (response_id, instance_id, reviewer_role,
       previous_weighted_score, new_weighted_score,
       template_id)
    VALUES (rec.id, v_instance, rec.reviewer_role, v_prev_weight, v_new_weight, v_template);
  END LOOP;

  SELECT ar.weighted_score
    INTO v_terminal_weight
    FROM public.annual_review_responses ar
   WHERE ar.instance_id = v_instance
   ORDER BY CASE ar.reviewer_role
              WHEN 'management' THEN 6
              WHEN 'bu_head'    THEN 5
              WHEN 'dept_head'  THEN 4
              WHEN 'hr'         THEN 3
              WHEN 'skip_manager' THEN 2
              WHEN 'manager'    THEN 1
              WHEN 'self'       THEN 0
            END DESC
   LIMIT 1;

  UPDATE public.annual_review_instances
     SET criteria_weighted_score = v_terminal_weight,
         updated_at = now()
   WHERE id = v_instance;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.balram_100002_repair_adr166',
    auth.uid(),
    jsonb_build_object(
      'instance_id', v_instance,
      'template_id', v_template,
      'terminal_weighted', v_terminal_weight,
      'note', 'ADR-166 targeted repair — rebuilt dept/bu criteria_scores to current template IDs and recomputed weighted_scores for self/dept/bu.'
    )
  );
END
$balram$;

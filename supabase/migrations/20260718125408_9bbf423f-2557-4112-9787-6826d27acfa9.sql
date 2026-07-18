-- ADR-122 / POLICY §AR-TEMPLATE-SWITCH-SCORE-CARRY
-- When a pending annual-review instance has its template_id or
-- template_override_id changed, existing responses.criteria_scores are keyed
-- to the previous template's criterion IDs and appear as "missing" to the
-- new template's validator. This migration adds a canonical carry-over that
-- remaps score keys by criterion `key` (preferred) or `name`
-- (case-insensitive, trimmed) — orphaned keys are dropped. Runs
-- automatically on template swap AND is executed by
-- set_annual_review_template_override in the same transaction.

CREATE OR REPLACE FUNCTION public.remap_annual_review_criteria_scores(
  p_instance_id     uuid,
  p_prev_template_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_template uuid;
  v_prev_crits   jsonb;
  v_new_crits    jsonb;
  v_touched      integer := 0;
  r              record;
  v_remapped     jsonb;
  v_old_key      text;
  v_old_val      jsonb;
  v_new_key      text;
  v_mapping      jsonb; -- old_id -> new_id
BEGIN
  IF p_instance_id IS NULL OR p_prev_template_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(template_override_id, template_id)
    INTO v_new_template
  FROM public.annual_review_instances
  WHERE id = p_instance_id;

  IF v_new_template IS NULL OR v_new_template = p_prev_template_id THEN
    RETURN 0;
  END IF;

  SELECT sections->'criteria' INTO v_prev_crits
    FROM public.annual_review_templates WHERE id = p_prev_template_id;
  SELECT sections->'criteria' INTO v_new_crits
    FROM public.annual_review_templates WHERE id = v_new_template;

  IF v_prev_crits IS NULL OR v_new_crits IS NULL
     OR jsonb_typeof(v_prev_crits) <> 'array'
     OR jsonb_typeof(v_new_crits)  <> 'array' THEN
    RETURN 0;
  END IF;

  -- Build old_id -> new_id map: prefer `key`, else lower(trim(name)).
  WITH prev AS (
    SELECT c->>'id'                                 AS old_id,
           NULLIF(c->>'key','')                     AS k,
           lower(btrim(COALESCE(c->>'name','')))    AS n
      FROM jsonb_array_elements(v_prev_crits) c
  ),
  new_c AS (
    SELECT c->>'id'                                 AS new_id,
           NULLIF(c->>'key','')                     AS k,
           lower(btrim(COALESCE(c->>'name','')))    AS n
      FROM jsonb_array_elements(v_new_crits) c
  ),
  matched AS (
    SELECT p.old_id,
           COALESCE(
             (SELECT n2.new_id FROM new_c n2 WHERE n2.k IS NOT NULL AND n2.k = p.k LIMIT 1),
             (SELECT n2.new_id FROM new_c n2 WHERE n2.n <> '' AND n2.n = p.n LIMIT 1)
           ) AS new_id
      FROM prev p
  )
  SELECT COALESCE(jsonb_object_agg(old_id, new_id) FILTER (WHERE new_id IS NOT NULL), '{}'::jsonb)
    INTO v_mapping
  FROM matched;

  -- Rewrite every response row on the instance.
  FOR r IN
    SELECT id, criteria_scores, qualitative_responses
      FROM public.annual_review_responses
     WHERE instance_id = p_instance_id
  LOOP
    -- criteria_scores
    v_remapped := '{}'::jsonb;
    IF r.criteria_scores IS NOT NULL AND jsonb_typeof(r.criteria_scores) = 'object' THEN
      FOR v_old_key, v_old_val IN SELECT * FROM jsonb_each(r.criteria_scores) LOOP
        v_new_key := v_mapping ->> v_old_key;
        IF v_new_key IS NULL THEN
          -- Preserve entries that already match a current criterion id
          -- (idempotent re-runs).
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_new_crits) c WHERE c->>'id' = v_old_key) THEN
            v_new_key := v_old_key;
          END IF;
        END IF;
        IF v_new_key IS NOT NULL THEN
          v_remapped := v_remapped || jsonb_build_object(v_new_key, v_old_val);
        END IF;
      END LOOP;
    END IF;

    UPDATE public.annual_review_responses
       SET criteria_scores = v_remapped,
           updated_at      = now()
     WHERE id = r.id
       AND criteria_scores IS DISTINCT FROM v_remapped;

    v_touched := v_touched + 1;
  END LOOP;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.criteria_scores_remapped',
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id,
      'prev_template_id', p_prev_template_id,
      'new_template_id', v_new_template,
      'response_rows', v_touched,
      'mapping', v_mapping
    )
  );

  RETURN v_touched;
END;
$$;

REVOKE ALL ON FUNCTION public.remap_annual_review_criteria_scores(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remap_annual_review_criteria_scores(uuid, uuid) TO authenticated, service_role;

-- Trigger: auto-run remap on template swap.
CREATE OR REPLACE FUNCTION public.tg_ar_template_switch_score_carry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev uuid;
  v_new  uuid;
BEGIN
  v_prev := COALESCE(OLD.template_override_id, OLD.template_id);
  v_new  := COALESCE(NEW.template_override_id, NEW.template_id);
  IF v_prev IS NOT NULL AND v_new IS NOT NULL AND v_prev <> v_new THEN
    PERFORM public.remap_annual_review_criteria_scores(NEW.id, v_prev);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_template_switch_score_carry ON public.annual_review_instances;
CREATE TRIGGER trg_ar_template_switch_score_carry
AFTER UPDATE OF template_id, template_override_id
ON public.annual_review_instances
FOR EACH ROW
WHEN (
  COALESCE(OLD.template_override_id, OLD.template_id)
  IS DISTINCT FROM
  COALESCE(NEW.template_override_id, NEW.template_id)
)
EXECUTE FUNCTION public.tg_ar_template_switch_score_carry();

-- Patch set_annual_review_template_override to also carry scores in the
-- same transaction (belt-and-braces alongside the trigger, and keeps the
-- audit log's mapping ordered before the override log entry).
CREATE OR REPLACE FUNCTION public.set_annual_review_template_override(
  p_instance_id uuid,
  p_template_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status annual_review_status;
  v_prev_override uuid;
  v_seeded_template uuid;
  v_employee uuid;
  v_cycle uuid;
  v_prev_effective uuid;
  v_new_effective uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can change an instance template';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 chars)';
  END IF;

  SELECT overall_status, template_override_id, template_id, employee_id, cycle_id
    INTO v_status, v_prev_override, v_seeded_template, v_employee, v_cycle
  FROM public.annual_review_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Instance not found'; END IF;

  IF v_status NOT IN ('not_started', 'pending_self') THEN
    RAISE EXCEPTION 'Template can only be changed before the review starts (current stage: %)', v_status;
  END IF;

  IF p_template_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.annual_review_templates
      WHERE id = p_template_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Target template is not active or does not exist';
    END IF;
  END IF;

  v_prev_effective := COALESCE(v_prev_override, v_seeded_template);
  v_new_effective  := COALESCE(p_template_id, v_seeded_template);

  UPDATE public.annual_review_instances
     SET template_override_id = p_template_id,
         updated_at = now()
   WHERE id = p_instance_id;

  -- Trigger already fires the remap when the effective template changes;
  -- calling explicitly is a no-op in that case (idempotent) and covers
  -- the edge case where trigger is disabled for maintenance.
  IF v_prev_effective IS NOT NULL AND v_prev_effective <> v_new_effective THEN
    PERFORM public.remap_annual_review_criteria_scores(p_instance_id, v_prev_effective);
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.template_override_set',
    v_uid,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'employee_id', v_employee,
      'cycle_id', v_cycle,
      'previous_override_id', v_prev_override,
      'new_override_id', p_template_id,
      'seeded_template_id', v_seeded_template,
      'reason', btrim(p_reason)
    )
  );
END;
$function$;

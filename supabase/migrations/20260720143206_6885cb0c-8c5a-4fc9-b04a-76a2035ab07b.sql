
-- ADR-127 — Normalise annual_review_instances.system_scores so no slot value
-- overflows its template weight. Rescales rating-in-points (0..5 stored where
-- weight is 2..4) via (v/5)*weight; clamps other overflow values to weight.
--
-- Safety: read-only diagnostic ran first (10 rows, 0 completed). Migration
-- writes an audit row per changed instance and installs a BEFORE trigger to
-- prevent regressions.

DO $$
DECLARE
  r RECORD;
  slot JSONB;
  slot_id TEXT;
  slot_weight NUMERIC;
  stored NUMERIC;
  new_val NUMERIC;
  new_map JSONB;
  changed BOOLEAN;
  before_map JSONB;
  changes JSONB;
BEGIN
  FOR r IN
    SELECT i.id,
           i.system_scores,
           COALESCE(t.sections->'system_scores','[]'::jsonb) AS slots
      FROM public.annual_review_instances i
      LEFT JOIN public.annual_review_templates t
        ON t.id = COALESCE(i.template_override_id, i.template_id)
     WHERE i.system_scores IS NOT NULL
  LOOP
    new_map := COALESCE(r.system_scores, '{}'::jsonb);
    before_map := new_map;
    changed := FALSE;
    changes := '[]'::jsonb;

    FOR slot IN SELECT * FROM jsonb_array_elements(r.slots)
    LOOP
      slot_id := slot->>'id';
      slot_weight := COALESCE((slot->>'weight')::numeric, 0);
      IF slot_weight <= 0 THEN CONTINUE; END IF;

      IF NOT (new_map ? slot_id) THEN CONTINUE; END IF;
      stored := NULLIF(new_map->>slot_id, '')::numeric;
      IF stored IS NULL THEN CONTINUE; END IF;

      new_val := stored;
      -- Rating-in-points overflow: stored > weight AND stored ≤ 5 AND weight < 5.
      IF stored > slot_weight AND stored <= 5 AND slot_weight < 5 THEN
        new_val := round((stored / 5.0) * slot_weight, 4);
      ELSIF stored > slot_weight THEN
        new_val := slot_weight;
      END IF;

      IF new_val <> stored THEN
        new_map := jsonb_set(new_map, ARRAY[slot_id], to_jsonb(new_val), false);
        changes := changes || jsonb_build_array(
          jsonb_build_object('slot', slot_id, 'from', stored, 'to', new_val, 'weight', slot_weight)
        );
        changed := TRUE;
      END IF;
    END LOOP;

    IF changed THEN
      UPDATE public.annual_review_instances
         SET system_scores = new_map,
             updated_at = now()
       WHERE id = r.id;

      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES (
        'annual_review.system_scores_normalise',
        NULL,
        jsonb_build_object(
          'adr', 'ADR-127',
          'instance_id', r.id,
          'before', before_map,
          'after', new_map,
          'changes', changes
        )
      );
    END IF;
  END LOOP;
END $$;

-- Write-path guard: on INSERT/UPDATE of annual_review_instances, clamp any
-- system_scores value that exceeds its resolved template slot weight, using
-- the same rating-in-points heuristic. Fires only when system_scores changed
-- so unrelated updates stay cheap.
CREATE OR REPLACE FUNCTION public.enforce_system_scores_within_weight()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slots JSONB;
  slot JSONB;
  slot_id TEXT;
  slot_weight NUMERIC;
  stored NUMERIC;
  new_val NUMERIC;
  new_map JSONB;
BEGIN
  IF NEW.system_scores IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.system_scores IS NOT DISTINCT FROM NEW.system_scores THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(t.sections->'system_scores','[]'::jsonb) INTO slots
    FROM public.annual_review_templates t
   WHERE t.id = COALESCE(NEW.template_override_id, NEW.template_id);
  IF slots IS NULL OR jsonb_array_length(slots) = 0 THEN RETURN NEW; END IF;

  new_map := NEW.system_scores;
  FOR slot IN SELECT * FROM jsonb_array_elements(slots)
  LOOP
    slot_id := slot->>'id';
    slot_weight := COALESCE((slot->>'weight')::numeric, 0);
    IF slot_weight <= 0 OR NOT (new_map ? slot_id) THEN CONTINUE; END IF;
    stored := NULLIF(new_map->>slot_id, '')::numeric;
    IF stored IS NULL THEN CONTINUE; END IF;

    new_val := stored;
    IF stored > slot_weight AND stored <= 5 AND slot_weight < 5 THEN
      new_val := round((stored / 5.0) * slot_weight, 4);
    ELSIF stored > slot_weight THEN
      new_val := slot_weight;
    END IF;

    IF new_val <> stored THEN
      new_map := jsonb_set(new_map, ARRAY[slot_id], to_jsonb(new_val), false);
    END IF;
  END LOOP;

  NEW.system_scores := new_map;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ar_system_scores_within_weight ON public.annual_review_instances;
CREATE TRIGGER trg_ar_system_scores_within_weight
BEFORE INSERT OR UPDATE OF system_scores ON public.annual_review_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_system_scores_within_weight();

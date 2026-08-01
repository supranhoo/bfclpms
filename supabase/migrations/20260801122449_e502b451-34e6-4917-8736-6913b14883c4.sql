
-- ============================================================
-- ADR-226 Phase 2 — Legacy recommendation classification
-- ============================================================

-- 1. Keyword rules master data ------------------------------------------------
CREATE TABLE public.annual_review_recommendation_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  type_key text NOT NULL REFERENCES public.annual_review_recommendation_types(key) ON UPDATE CASCADE,
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern, type_key)
);

GRANT SELECT ON public.annual_review_recommendation_keywords TO authenticated;
GRANT ALL ON public.annual_review_recommendation_keywords TO service_role;

ALTER TABLE public.annual_review_recommendation_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_keywords_read"
  ON public.annual_review_recommendation_keywords FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rec_keywords_manage"
  ON public.annual_review_recommendation_keywords FOR ALL
  TO authenticated
  USING (public.ar_can_decide_recommendation())
  WITH CHECK (public.ar_can_decide_recommendation());

CREATE TRIGGER trg_rec_keywords_updated_at
  BEFORE UPDATE ON public.annual_review_recommendation_keywords
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_rec_keywords_active ON public.annual_review_recommendation_keywords (is_active, type_key);

-- Seed starter patterns (all editable by HR/Admin afterwards)
INSERT INTO public.annual_review_recommendation_keywords (pattern, type_key, weight, notes) VALUES
  ('promot',                'promotion',       3, 'promote / promotion / promoted'),
  ('next level',            'promotion',       2, NULL),
  ('elevate',               'promotion',       2, NULL),
  ('upgrade to',            'promotion',       2, NULL),
  ('un ?skill[a-z]* to',    'promotion',       3, 'unskilled -> semi skilled progression'),
  ('semi ?skill',           'promotion',       1, NULL),
  ('to the post',           'promotion',       2, NULL),
  ('higher (post|role|position)', 'promotion', 2, NULL),
  ('special incre(ment|ament|ase)', 'special_hike', 3, 'includes common misspelling'),
  ('special hike',          'special_hike',    3, NULL),
  ('hike',                  'special_hike',    2, NULL),
  ('salary (revis|increas|hike)', 'special_hike', 2, NULL),
  ('out of turn increment', 'special_hike',    3, NULL),
  ('bonus',                 'one_time_reward', 3, NULL),
  ('reward',                'one_time_reward', 2, NULL),
  ('one time',              'one_time_reward', 2, NULL),
  ('incentive',             'one_time_reward', 2, NULL),
  ('grade change',          'grade_change',    3, NULL),
  ('band change',           'grade_change',    3, NULL),
  ('re ?grade',             'grade_change',    2, NULL),
  ('role change',           'role_change',     3, NULL),
  ('rotation',              'role_change',     2, NULL),
  ('transfer to',           'role_change',     2, NULL),
  ('training',              'training',        3, NULL),
  ('learning',              'training',        1, NULL),
  ('needs? improvement',    'training',        2, NULL),
  ('skill development',     'training',        2, NULL);

-- 2. Import run audit log -----------------------------------------------------
CREATE TABLE public.annual_review_recommendation_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.annual_review_cycles(id) ON DELETE CASCADE,
  performed_by uuid,
  dry_run boolean NOT NULL DEFAULT true,
  scanned_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  needs_classification_count integer NOT NULL DEFAULT 0,
  type_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  rolled_back_at timestamptz,
  rolled_back_by uuid,
  rolled_back_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_recommendation_import_runs TO authenticated;
GRANT ALL ON public.annual_review_recommendation_import_runs TO service_role;

ALTER TABLE public.annual_review_recommendation_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_import_runs_read"
  ON public.annual_review_recommendation_import_runs FOR SELECT
  TO authenticated USING (public.ar_can_decide_recommendation());

CREATE POLICY "rec_import_runs_no_direct_write"
  ON public.annual_review_recommendation_import_runs FOR INSERT
  TO authenticated WITH CHECK (false);

CREATE INDEX idx_rec_import_runs_cycle ON public.annual_review_recommendation_import_runs (cycle_id, created_at DESC);

-- 3. Link imported recommendations back to their run --------------------------
ALTER TABLE public.annual_review_recommendations
  ADD COLUMN import_run_id uuid REFERENCES public.annual_review_recommendation_import_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_ar_rec_import_run ON public.annual_review_recommendations (import_run_id);
CREATE INDEX idx_ar_rec_cycle_source ON public.annual_review_recommendations (cycle_id, source);

-- 4. Amount / percent parser (SSOT, mirrored in TypeScript) -------------------
CREATE OR REPLACE FUNCTION public.ar_parse_recommendation_amount(p_text text)
RETURNS TABLE(amount_kind text, amount_value numeric)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_txt text := lower(coalesce(p_text, ''));
  v_m   text[];
BEGIN
  -- percent first: "25 percent", "12%", "12 %"
  v_m := regexp_match(v_txt, '([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*(?:%|percent|pct)');
  IF v_m IS NOT NULL THEN
    amount_kind := 'percent';
    amount_value := (v_m[1])::numeric;
    IF amount_value >= 0 AND amount_value <= 100 THEN
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- absolute: "rs. 5000", "rs 2,000", "inr 3000", "(2500)"
  v_m := regexp_match(v_txt, '(?:rs\.?|inr|₹)\s*([0-9][0-9,]{2,})');
  IF v_m IS NULL THEN
    v_m := regexp_match(v_txt, '\(\s*([0-9][0-9,]{2,})\s*\)');
  END IF;
  IF v_m IS NOT NULL THEN
    amount_kind := 'absolute';
    amount_value := replace(v_m[1], ',', '')::numeric;
    IF amount_value > 0 THEN
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  RETURN;
END;
$function$;

-- 5. Classifier ---------------------------------------------------------------
-- Returns matched type keys ordered by descending confidence plus a score.
CREATE OR REPLACE FUNCTION public.ar_classify_recommendation_text(p_text text)
RETURNS TABLE(type_key text, score integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT k.type_key, sum(k.weight)::int AS score
    FROM public.annual_review_recommendation_keywords k
   WHERE k.is_active
     AND coalesce(btrim(p_text), '') <> ''
     AND lower(p_text) ~ k.pattern
   GROUP BY k.type_key
   ORDER BY score DESC, k.type_key;
$function$;

-- 6. Backfill engine ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ar_backfill_legacy_recommendations(
  p_cycle_id uuid,
  p_dry_run boolean DEFAULT true,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_rec record;
  v_types record;
  v_scanned int := 0;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_needs int := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_sample jsonb := '[]'::jsonb;
  v_keys text[];
  v_best_score int;
  v_status text;
  v_amount record;
  v_rec_id uuid;
  v_existing record;
  v_desig_id uuid;
  v_desig_txt text;
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Not authorised to import legacy recommendations';
  END IF;

  INSERT INTO public.annual_review_recommendation_import_runs (cycle_id, performed_by, dry_run)
  VALUES (p_cycle_id, v_uid, coalesce(p_dry_run, true))
  RETURNING id INTO v_run_id;

  FOR v_rec IN
    SELECT r.instance_id,
           r.reviewer_role,
           r.reviewer_id,
           i.employee_id,
           i.cycle_id,
           btrim(r.qualitative_responses->>'__overall_recommendation') AS narrative
      FROM public.annual_review_responses r
      JOIN public.annual_review_instances i ON i.id = r.instance_id
     WHERE i.cycle_id = p_cycle_id
       AND r.reviewer_role IN ('dept_head','bu_head','management')
       AND coalesce(btrim(r.qualitative_responses->>'__overall_recommendation'), '') <> ''
     ORDER BY r.instance_id, r.reviewer_role
     LIMIT GREATEST(coalesce(p_limit, 5000), 1)
  LOOP
    v_scanned := v_scanned + 1;

    -- Existing row for this stage? Never touch a decided one.
    SELECT * INTO v_existing
      FROM public.annual_review_recommendations x
     WHERE x.instance_id = v_rec.instance_id
       AND x.reviewer_role = v_rec.reviewer_role;

    IF FOUND AND (v_existing.source = 'stage_form'
                  OR v_existing.status NOT IN ('needs_classification','submitted')
                  OR v_existing.decided_at IS NOT NULL) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Classify
    v_keys := ARRAY[]::text[];
    v_best_score := 0;
    FOR v_types IN SELECT * FROM public.ar_classify_recommendation_text(v_rec.narrative) LOOP
      v_keys := v_keys || v_types.type_key;
      v_best_score := GREATEST(v_best_score, v_types.score);
    END LOOP;

    IF array_length(v_keys, 1) IS NULL THEN
      v_keys := ARRAY['none'];
      v_status := 'needs_classification';
    ELSIF v_best_score >= 3 THEN
      v_status := 'submitted';
    ELSE
      v_status := 'needs_classification';
    END IF;

    IF v_status = 'needs_classification' THEN
      v_needs := v_needs + 1;
    END IF;

    -- Amount
    SELECT * INTO v_amount FROM public.ar_parse_recommendation_amount(v_rec.narrative);

    -- Proposed designation: text after "to <name>" matched against master data
    v_desig_id := NULL;
    IF 'promotion' = ANY(v_keys) OR 'grade_change' = ANY(v_keys) THEN
      v_desig_txt := (regexp_match(lower(v_rec.narrative), 'to\s+(?:the\s+post\s+of\s+)?"?([a-z][a-z /&.-]{1,40})'))[1];
      IF v_desig_txt IS NOT NULL THEN
        SELECT d.id INTO v_desig_id
          FROM public.designations d
         WHERE lower(btrim(d.name)) = btrim(v_desig_txt)
            OR btrim(v_desig_txt) LIKE lower(btrim(d.name)) || '%'
         ORDER BY length(d.name) DESC
         LIMIT 1;
      END IF;
    END IF;

    -- Breakdown counters
    v_breakdown := jsonb_set(
      v_breakdown,
      ARRAY[v_keys[1]],
      to_jsonb(coalesce((v_breakdown->>v_keys[1])::int, 0) + 1),
      true
    );

    IF jsonb_array_length(v_sample) < 25 THEN
      v_sample := v_sample || jsonb_build_object(
        'instance_id', v_rec.instance_id,
        'reviewer_role', v_rec.reviewer_role,
        'types', to_jsonb(v_keys),
        'status', v_status,
        'amount_kind', v_amount.amount_kind,
        'amount_value', v_amount.amount_value,
        'narrative', left(v_rec.narrative, 200)
      );
    END IF;

    IF coalesce(p_dry_run, true) THEN
      IF v_existing.id IS NULL THEN v_created := v_created + 1; ELSE v_updated := v_updated + 1; END IF;
      CONTINUE;
    END IF;

    IF v_existing.id IS NULL THEN
      INSERT INTO public.annual_review_recommendations (
        instance_id, cycle_id, employee_id, reviewer_id, reviewer_role,
        amount_kind, amount_value, proposed_designation_id,
        narrative, source, status, import_run_id
      ) VALUES (
        v_rec.instance_id, v_rec.cycle_id, v_rec.employee_id, v_rec.reviewer_id, v_rec.reviewer_role,
        v_amount.amount_kind, v_amount.amount_value, v_desig_id,
        v_rec.narrative, 'legacy_import', v_status, v_run_id
      )
      RETURNING id INTO v_rec_id;
      v_created := v_created + 1;
    ELSE
      UPDATE public.annual_review_recommendations
         SET amount_kind = v_amount.amount_kind,
             amount_value = v_amount.amount_value,
             proposed_designation_id = v_desig_id,
             narrative = v_rec.narrative,
             status = v_status,
             import_run_id = v_run_id,
             updated_at = now()
       WHERE id = v_existing.id
      RETURNING id INTO v_rec_id;
      DELETE FROM public.annual_review_recommendation_items WHERE recommendation_id = v_rec_id;
      v_updated := v_updated + 1;
    END IF;

    INSERT INTO public.annual_review_recommendation_items (recommendation_id, type_id)
    SELECT v_rec_id, t.id
      FROM public.annual_review_recommendation_types t
     WHERE t.key = ANY(v_keys)
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.annual_review_recommendation_import_runs
     SET scanned_count = v_scanned,
         created_count = v_created,
         updated_count = v_updated,
         skipped_count = v_skipped,
         needs_classification_count = v_needs,
         type_breakdown = v_breakdown,
         sample = v_sample
   WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'dry_run', coalesce(p_dry_run, true),
    'scanned', v_scanned,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'needs_classification', v_needs,
    'type_breakdown', v_breakdown,
    'sample', v_sample
  );
END;
$function$;

-- 7. Rollback -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ar_rollback_recommendation_import(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Not authorised to roll back a recommendation import';
  END IF;

  WITH doomed AS (
    DELETE FROM public.annual_review_recommendations r
     WHERE r.import_run_id = p_run_id
       AND r.source = 'legacy_import'
       AND r.decided_at IS NULL
       AND r.status IN ('needs_classification','submitted')
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM doomed;

  UPDATE public.annual_review_recommendation_import_runs
     SET rolled_back_at = now(),
         rolled_back_by = v_uid,
         rolled_back_count = v_deleted
   WHERE id = p_run_id;

  RETURN jsonb_build_object('run_id', p_run_id, 'deleted', v_deleted);
END;
$function$;

-- 8. Queue: expose source + allow filtering by it ------------------------------
DROP FUNCTION IF EXISTS public.ar_recommendation_queue(uuid, text, text, boolean, text, integer, integer);

CREATE OR REPLACE FUNCTION public.ar_recommendation_queue(
  p_cycle_id uuid,
  p_status text DEFAULT NULL::text,
  p_type_key text DEFAULT NULL::text,
  p_monetary_only boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_source text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, instance_id uuid, employee_id uuid, employee_code text, employee_name text,
  department_name text, business_unit_name text, designation_name text,
  reviewer_role annual_reviewer_role, reviewer_name text, type_keys text[], type_labels text[],
  is_monetary boolean, amount_kind text, amount_value numeric, approved_amount_kind text,
  approved_amount_value numeric, proposed_designation text, proposed_grade text,
  effective_from date, narrative text, status text, source text, decided_at timestamptz,
  decision_reason text, final_rating text, total_score numeric, created_at timestamptz,
  total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Not authorised to view the recommendation queue';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.*,
           i.total_score AS i_total_score,
           i.final_rating AS i_final_rating,
           p.employee_code AS emp_code,
           p.full_name AS emp_name,
           d.name AS dept_name,
           bu.name AS bu_name,
           dg.name AS desig_name,
           rp.full_name AS rev_name,
           pd.name AS prop_desig,
           pgd.name AS prop_grade,
           ARRAY(SELECT t.key FROM public.annual_review_recommendation_items it
                   JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                  WHERE it.recommendation_id = r.id ORDER BY t.sort_order) AS t_keys,
           ARRAY(SELECT t.label FROM public.annual_review_recommendation_items it
                   JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                  WHERE it.recommendation_id = r.id ORDER BY t.sort_order) AS t_labels,
           EXISTS (SELECT 1 FROM public.annual_review_recommendation_items it
                     JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                    WHERE it.recommendation_id = r.id AND t.is_monetary) AS monetary
      FROM public.annual_review_recommendations r
      JOIN public.annual_review_instances i ON i.id = r.instance_id
      LEFT JOIN public.profiles p ON p.id = r.employee_id
      LEFT JOIN public.departments d ON d.id = p.department_id
      LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
      LEFT JOIN public.designations dg ON dg.id = p.designation_id
      LEFT JOIN public.profiles rp ON rp.id = r.reviewer_id
      LEFT JOIN public.designations pd ON pd.id = r.proposed_designation_id
      LEFT JOIN public.pms_grades pgd ON pgd.id = r.proposed_grade_id
     WHERE r.cycle_id = p_cycle_id
  ), filtered AS (
    SELECT * FROM base b
     WHERE (p_status IS NULL OR b.status = p_status)
       AND (p_source IS NULL OR b.source = p_source)
       AND (p_type_key IS NULL OR p_type_key = ANY(b.t_keys))
       AND (NOT p_monetary_only OR b.monetary)
       AND (
         COALESCE(btrim(p_search), '') = ''
         OR b.emp_name ILIKE '%' || p_search || '%'
         OR b.emp_code ILIKE '%' || p_search || '%'
         OR b.narrative ILIKE '%' || p_search || '%'
       )
  )
  SELECT f.id, f.instance_id, f.employee_id, f.emp_code, f.emp_name, f.dept_name, f.bu_name,
         f.desig_name, f.reviewer_role, f.rev_name, f.t_keys, f.t_labels, f.monetary,
         f.amount_kind, f.amount_value, f.approved_amount_kind, f.approved_amount_value,
         f.prop_desig, f.prop_grade, f.effective_from, f.narrative, f.status, f.source,
         f.decided_at, f.decision_reason, f.i_final_rating, f.i_total_score, f.created_at,
         (SELECT count(*) FROM filtered) AS total_count
    FROM filtered f
   ORDER BY f.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

-- 9. Reclassification of an imported row (HR fixes a wrong guess) --------------
CREATE OR REPLACE FUNCTION public.ar_reclassify_recommendation(
  p_recommendation_id uuid,
  p_type_keys text[],
  p_amount_kind text DEFAULT NULL,
  p_amount_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Not authorised to reclassify recommendations';
  END IF;

  SELECT status INTO v_status FROM public.annual_review_recommendations WHERE id = p_recommendation_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Recommendation not found';
  END IF;
  IF v_status NOT IN ('needs_classification','submitted') THEN
    RAISE EXCEPTION 'Only undecided recommendations can be reclassified';
  END IF;

  UPDATE public.annual_review_recommendations
     SET amount_kind = p_amount_kind,
         amount_value = p_amount_value,
         status = 'submitted',
         updated_at = now()
   WHERE id = p_recommendation_id;

  DELETE FROM public.annual_review_recommendation_items WHERE recommendation_id = p_recommendation_id;

  INSERT INTO public.annual_review_recommendation_items (recommendation_id, type_id)
  SELECT p_recommendation_id, t.id
    FROM public.annual_review_recommendation_types t
   WHERE t.key = ANY(coalesce(p_type_keys, ARRAY[]::text[]))
  ON CONFLICT DO NOTHING;

  RETURN p_recommendation_id;
END;
$function$;

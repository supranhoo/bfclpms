-- ADR-324 — KPI scoring ladders: one KPI, different scoring per employee tier.

CREATE TABLE IF NOT EXISTS public.bu_console_kpi_ladder_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_key text NOT NULL,
  kpi_name text NOT NULL,
  review_period text,
  review_year integer,
  cascade_mode text NOT NULL DEFAULT 'explicit'
    CHECK (cascade_mode IN ('explicit','auto_split')),
  split_mode text NOT NULL DEFAULT 'equal'
    CHECK (split_mode IN ('equal','weighted')),
  parent_target numeric,
  rollup_mode text NOT NULL DEFAULT 'independent'
    CHECK (rollup_mode IN ('independent','central')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bu_console_kpi_ladder_config_uniq
  ON public.bu_console_kpi_ladder_config
  (kpi_key, COALESCE(review_period,''), COALESCE(review_year,0));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bu_console_kpi_ladder_config TO authenticated;
GRANT ALL ON public.bu_console_kpi_ladder_config TO service_role;
ALTER TABLE public.bu_console_kpi_ladder_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ladder_config_read" ON public.bu_console_kpi_ladder_config
  FOR SELECT TO authenticated USING (public.bu_console_can_read(auth.uid()));
CREATE POLICY "ladder_config_admin_write" ON public.bu_console_kpi_ladder_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER bu_console_kpi_ladder_config_touch
  BEFORE UPDATE ON public.bu_console_kpi_ladder_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.bu_console_kpi_scoring_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_key text NOT NULL,
  kpi_name text NOT NULL,
  review_period text,
  review_year integer,
  tier_label text NOT NULL,
  match_dimension text NOT NULL
    CHECK (match_dimension IN ('default','level','designation','department','is_manager','employee')),
  match_value text,
  priority integer NOT NULL DEFAULT 100,
  target_value numeric,
  weightage numeric,
  r5 text, r4 text, r3 text, r2 text, r1 text, r0 text,
  kpi_formula text,
  kpi_scoring_logic text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bu_console_kpi_scoring_tiers_key_idx
  ON public.bu_console_kpi_scoring_tiers (kpi_key);
CREATE UNIQUE INDEX IF NOT EXISTS bu_console_kpi_scoring_tiers_uniq
  ON public.bu_console_kpi_scoring_tiers
  (kpi_key, match_dimension, COALESCE(match_value,''), COALESCE(review_period,''), COALESCE(review_year,0));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bu_console_kpi_scoring_tiers TO authenticated;
GRANT ALL ON public.bu_console_kpi_scoring_tiers TO service_role;
ALTER TABLE public.bu_console_kpi_scoring_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ladder_tiers_read" ON public.bu_console_kpi_scoring_tiers
  FOR SELECT TO authenticated USING (public.bu_console_can_read(auth.uid()));
CREATE POLICY "ladder_tiers_admin_write" ON public.bu_console_kpi_scoring_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER bu_console_kpi_scoring_tiers_touch
  BEFORE UPDATE ON public.bu_console_kpi_scoring_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Canonical ladder identity, mirrors bu_console_target_rules_apply's key.
CREATE OR REPLACE FUNCTION public.bu_console_ladder_key(
  p_category_id uuid, p_kra_name text, p_kpi_name text
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_category_id::text, '-') || '|' ||
         public.normalize_kpi_text(p_kra_name) || '|' ||
         public.normalize_kpi_text(p_kpi_name);
$$;

-- Fields a tier may write. Nothing else is ever emitted.
CREATE OR REPLACE FUNCTION public.bu_console_ladder_fields()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT ARRAY['target_value','weightage','r5','r4','r3','r2','r1','r0','kpi_formula','kpi_scoring_logic']::text[]; $$;

CREATE OR REPLACE FUNCTION public.bu_console_ladder_get(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_period text DEFAULT NULL, p_year integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_key text := public.bu_console_ladder_key(p_category_id, p_kra_name, p_kpi_name);
  v_cfg jsonb;
  v_tiers jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'config', NULL, 'tiers', '[]'::jsonb);
  END IF;

  SELECT to_jsonb(c) INTO v_cfg
  FROM public.bu_console_kpi_ladder_config c
  WHERE c.kpi_key = v_key
    AND (c.review_period IS NULL OR c.review_period = p_period)
    AND (c.review_year IS NULL OR c.review_year = p_year)
  ORDER BY (c.review_period IS NULL) ASC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY (t.match_dimension = 'default') ASC, t.priority ASC), '[]'::jsonb)
  INTO v_tiers
  FROM public.bu_console_kpi_scoring_tiers t
  WHERE t.kpi_key = v_key
    AND (t.review_period IS NULL OR t.review_period = p_period)
    AND (t.review_year IS NULL OR t.review_year = p_year);

  RETURN jsonb_build_object('authorized', true, 'kpi_key', v_key, 'config', v_cfg, 'tiers', v_tiers);
END;
$$;

CREATE OR REPLACE FUNCTION public.bu_console_ladder_upsert(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_period text, p_year integer,
  p_config jsonb DEFAULT '{}'::jsonb,
  p_tiers jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_key text := public.bu_console_ladder_key(p_category_id, p_kra_name, p_kpi_name);
  v_t jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user,'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  INSERT INTO public.bu_console_kpi_ladder_config (
    category_id, kra_name, kpi_key, kpi_name, review_period, review_year,
    cascade_mode, split_mode, parent_target, rollup_mode, notes, created_by)
  VALUES (
    p_category_id, p_kra_name, v_key, p_kpi_name, p_period, p_year,
    COALESCE(p_config->>'cascade_mode','explicit'),
    COALESCE(p_config->>'split_mode','equal'),
    NULLIF(p_config->>'parent_target','')::numeric,
    COALESCE(p_config->>'rollup_mode','independent'),
    NULLIF(p_config->>'notes',''), v_user)
  ON CONFLICT (kpi_key, COALESCE(review_period,''), COALESCE(review_year,0))
  DO UPDATE SET
    cascade_mode = EXCLUDED.cascade_mode,
    split_mode = EXCLUDED.split_mode,
    parent_target = EXCLUDED.parent_target,
    rollup_mode = EXCLUDED.rollup_mode,
    notes = EXCLUDED.notes,
    updated_at = now();

  FOR v_t IN SELECT * FROM jsonb_array_elements(COALESCE(p_tiers,'[]'::jsonb))
  LOOP
    INSERT INTO public.bu_console_kpi_scoring_tiers (
      category_id, kra_name, kpi_key, kpi_name, review_period, review_year,
      tier_label, match_dimension, match_value, priority,
      target_value, weightage, r5, r4, r3, r2, r1, r0,
      kpi_formula, kpi_scoring_logic, notes, created_by)
    VALUES (
      p_category_id, p_kra_name, v_key, p_kpi_name, p_period, p_year,
      COALESCE(NULLIF(v_t->>'tier_label',''), 'Tier'),
      v_t->>'match_dimension',
      NULLIF(v_t->>'match_value',''),
      COALESCE(NULLIF(v_t->>'priority','')::int, 100),
      NULLIF(v_t->>'target_value','')::numeric,
      NULLIF(v_t->>'weightage','')::numeric,
      NULLIF(v_t->>'r5',''), NULLIF(v_t->>'r4',''), NULLIF(v_t->>'r3',''),
      NULLIF(v_t->>'r2',''), NULLIF(v_t->>'r1',''), NULLIF(v_t->>'r0',''),
      NULLIF(v_t->>'kpi_formula',''), NULLIF(v_t->>'kpi_scoring_logic',''),
      NULLIF(v_t->>'notes',''), v_user)
    ON CONFLICT (kpi_key, match_dimension, COALESCE(match_value,''), COALESCE(review_period,''), COALESCE(review_year,0))
    DO UPDATE SET
      tier_label = EXCLUDED.tier_label,
      priority = EXCLUDED.priority,
      target_value = EXCLUDED.target_value,
      weightage = EXCLUDED.weightage,
      r5 = EXCLUDED.r5, r4 = EXCLUDED.r4, r3 = EXCLUDED.r3,
      r2 = EXCLUDED.r2, r1 = EXCLUDED.r1, r0 = EXCLUDED.r0,
      kpi_formula = EXCLUDED.kpi_formula,
      kpi_scoring_logic = EXCLUDED.kpi_scoring_logic,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  -- Tiers removed in the editor are dropped for this exact scope.
  DELETE FROM public.bu_console_kpi_scoring_tiers t
  WHERE t.kpi_key = v_key
    AND COALESCE(t.review_period,'') = COALESCE(p_period,'')
    AND COALESCE(t.review_year,0) = COALESCE(p_year,0)
    AND NOT (t.id = ANY(v_ids));

  RETURN public.bu_console_ladder_get(p_category_id, p_kra_name, p_kpi_name, p_period, p_year);
END;
$$;

-- Resolve + optionally apply the ladder for one month.
CREATE OR REPLACE FUNCTION public.bu_console_ladder_apply(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_period text, p_year integer,
  p_bu_ids uuid[] DEFAULT NULL, p_dept_ids uuid[] DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL, p_manager_ids uuid[] DEFAULT NULL,
  p_reset_overrides boolean DEFAULT false,
  p_dry_run boolean DEFAULT true,
  p_fields text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_key text := public.bu_console_ladder_key(p_category_id, p_kra_name, p_kpi_name);
  v_fields text[] := COALESCE(p_fields, public.bu_console_ladder_fields());
  v_desc text[] := public.bu_console_descriptive_fields();
  v_cfg record;
  v_rec record;
  v_tier record;
  v_run uuid;
  v_new jsonb;
  v_old jsonb;
  v_reason text;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_tier_stats jsonb := '[]'::jsonb;
  v_applied int := 0;
  v_skip_n int := 0;
  v_target numeric;
  v_headcount int;
  v_desc_only boolean;
  f text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_user,'admin') THEN
    RETURN jsonb_build_object('authorized', false, 'preview','[]'::jsonb, 'skipped_details','[]'::jsonb);
  END IF;

  SELECT * INTO v_cfg
  FROM public.bu_console_kpi_ladder_config c
  WHERE c.kpi_key = v_key
    AND (c.review_period IS NULL OR c.review_period = p_period)
    AND (c.review_year IS NULL OR c.review_year = p_year)
  ORDER BY (c.review_period IS NULL) ASC
  LIMIT 1;

  CREATE TEMP TABLE _ladder_rows ON COMMIT DROP AS
  SELECT k.id AS kpi_id, k.employee_id, k.target_value AS cur_target, k.weightage AS cur_weightage,
         k.r5 AS cur_r5, k.r4 AS cur_r4, k.r3 AS cur_r3, k.r2 AS cur_r2, k.r1 AS cur_r1, k.r0 AS cur_r0,
         k.kpi_formula AS cur_formula, k.kpi_scoring_logic AS cur_scoring,
         k.status::text AS status,
         p.full_name, p.employee_code, p.designation, p.level, p.department_id, p.id AS profile_id,
         d.name AS department_name,
         EXISTS (SELECT 1 FROM public.profiles r WHERE r.reporting_manager_id = p.id AND r.is_active = true) AS is_manager,
         rs.final_score
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND (p_category_id IS NULL OR k.category_id = p_category_id)
    AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title),''), k.kpi_name))
        = public.normalize_kpi_text(p_kpi_name)
    AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
    AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
         OR d.business_unit_id IN (SELECT b2.id FROM public.business_units b2 WHERE b2.division_id = ANY(p_division_ids)))
    AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids));

  FOR v_rec IN SELECT * FROM _ladder_rows ORDER BY full_name LOOP
    SELECT t.* INTO v_tier
    FROM public.bu_console_kpi_scoring_tiers t
    WHERE t.kpi_key = v_key
      AND (t.review_period IS NULL OR t.review_period = p_period)
      AND (t.review_year IS NULL OR t.review_year = p_year)
      AND (
        t.match_dimension = 'default'
        OR (t.match_dimension = 'level' AND lower(COALESCE(v_rec.level,'')) = lower(COALESCE(t.match_value,'')))
        OR (t.match_dimension = 'designation' AND lower(COALESCE(v_rec.designation,'')) = lower(COALESCE(t.match_value,'')))
        OR (t.match_dimension = 'department' AND v_rec.department_id::text = t.match_value)
        OR (t.match_dimension = 'is_manager' AND v_rec.is_manager = (lower(COALESCE(t.match_value,'true')) = 'true'))
        OR (t.match_dimension = 'employee' AND v_rec.employee_id::text = t.match_value)
      )
    ORDER BY (t.match_dimension = 'default') ASC, t.priority ASC, t.updated_at DESC
    LIMIT 1;

    IF v_tier.id IS NULL THEN
      v_skip_n := v_skip_n + 1;
      IF v_skip_n <= 500 THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'reason', 'no_matching_tier');
      END IF;
      CONTINUE;
    END IF;

    -- Cascade: auto-split spreads the parent number across the matched tier.
    v_target := v_tier.target_value;
    IF COALESCE(v_cfg.cascade_mode,'explicit') = 'auto_split' AND v_cfg.parent_target IS NOT NULL THEN
      SELECT count(*) INTO v_headcount FROM _ladder_rows r
      WHERE (v_tier.match_dimension = 'default')
         OR (v_tier.match_dimension = 'level' AND lower(COALESCE(r.level,'')) = lower(COALESCE(v_tier.match_value,'')))
         OR (v_tier.match_dimension = 'designation' AND lower(COALESCE(r.designation,'')) = lower(COALESCE(v_tier.match_value,'')))
         OR (v_tier.match_dimension = 'department' AND r.department_id::text = v_tier.match_value)
         OR (v_tier.match_dimension = 'is_manager' AND r.is_manager = (lower(COALESCE(v_tier.match_value,'true')) = 'true'))
         OR (v_tier.match_dimension = 'employee' AND r.employee_id::text = v_tier.match_value);
      IF COALESCE(v_headcount,0) > 0 THEN
        v_target := round(v_cfg.parent_target / v_headcount, 2);
      END IF;
    END IF;

    v_new := '{}'::jsonb;
    v_old := '{}'::jsonb;
    FOREACH f IN ARRAY v_fields LOOP
      IF f = 'target_value' AND v_target IS NOT NULL
         AND COALESCE(v_rec.cur_target, -1e18) IS DISTINCT FROM v_target THEN
        v_new := v_new || jsonb_build_object('target_value', v_target);
        v_old := v_old || jsonb_build_object('target_value', v_rec.cur_target);
      ELSIF f = 'weightage' AND v_tier.weightage IS NOT NULL
         AND v_rec.cur_weightage IS DISTINCT FROM v_tier.weightage THEN
        v_new := v_new || jsonb_build_object('weightage', v_tier.weightage);
        v_old := v_old || jsonb_build_object('weightage', v_rec.cur_weightage);
      ELSIF f = 'r5' AND v_tier.r5 IS NOT NULL AND v_rec.cur_r5 IS DISTINCT FROM v_tier.r5 THEN
        v_new := v_new || jsonb_build_object('r5', v_tier.r5); v_old := v_old || jsonb_build_object('r5', v_rec.cur_r5);
      ELSIF f = 'r4' AND v_tier.r4 IS NOT NULL AND v_rec.cur_r4 IS DISTINCT FROM v_tier.r4 THEN
        v_new := v_new || jsonb_build_object('r4', v_tier.r4); v_old := v_old || jsonb_build_object('r4', v_rec.cur_r4);
      ELSIF f = 'r3' AND v_tier.r3 IS NOT NULL AND v_rec.cur_r3 IS DISTINCT FROM v_tier.r3 THEN
        v_new := v_new || jsonb_build_object('r3', v_tier.r3); v_old := v_old || jsonb_build_object('r3', v_rec.cur_r3);
      ELSIF f = 'r2' AND v_tier.r2 IS NOT NULL AND v_rec.cur_r2 IS DISTINCT FROM v_tier.r2 THEN
        v_new := v_new || jsonb_build_object('r2', v_tier.r2); v_old := v_old || jsonb_build_object('r2', v_rec.cur_r2);
      ELSIF f = 'r1' AND v_tier.r1 IS NOT NULL AND v_rec.cur_r1 IS DISTINCT FROM v_tier.r1 THEN
        v_new := v_new || jsonb_build_object('r1', v_tier.r1); v_old := v_old || jsonb_build_object('r1', v_rec.cur_r1);
      ELSIF f = 'r0' AND v_tier.r0 IS NOT NULL AND v_rec.cur_r0 IS DISTINCT FROM v_tier.r0 THEN
        v_new := v_new || jsonb_build_object('r0', v_tier.r0); v_old := v_old || jsonb_build_object('r0', v_rec.cur_r0);
      ELSIF f = 'kpi_formula' AND v_tier.kpi_formula IS NOT NULL
         AND COALESCE(v_rec.cur_formula,'') IS DISTINCT FROM v_tier.kpi_formula THEN
        v_new := v_new || jsonb_build_object('kpi_formula', v_tier.kpi_formula);
        v_old := v_old || jsonb_build_object('kpi_formula', v_rec.cur_formula);
      ELSIF f = 'kpi_scoring_logic' AND v_tier.kpi_scoring_logic IS NOT NULL
         AND COALESCE(v_rec.cur_scoring,'') IS DISTINCT FROM v_tier.kpi_scoring_logic THEN
        v_new := v_new || jsonb_build_object('kpi_scoring_logic', v_tier.kpi_scoring_logic);
        v_old := v_old || jsonb_build_object('kpi_scoring_logic', v_rec.cur_scoring);
      END IF;
    END LOOP;

    IF v_new = '{}'::jsonb THEN
      v_skip_n := v_skip_n + 1;
      IF v_skip_n <= 500 THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'tier_label', v_tier.tier_label, 'reason', 'already_matches');
      END IF;
      CONTINUE;
    END IF;

    -- ADR-323 parity: wording-only ladder writes are safe on locked rows.
    SELECT NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_new) AS ch(field)
      WHERE NOT (ch.field = ANY (v_desc))
    ) INTO v_desc_only;

    v_reason := NULL;
    IF v_rec.final_score IS NOT NULL AND NOT v_desc_only THEN
      v_reason := 'final_score_locked';
    ELSIF NOT p_reset_overrides AND EXISTS (
      SELECT 1 FROM public.bu_console_kpi_overrides o
      WHERE o.kpi_id = v_rec.kpi_id
        AND o.field IN (SELECT jsonb_object_keys(v_new))
        AND NOT (o.field = ANY (v_desc))
    ) THEN
      v_reason := 'manual_override';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      IF v_skip_n <= 500 THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'tier_label', v_tier.tier_label, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;
    IF v_applied <= 500 THEN
      v_preview := v_preview || jsonb_build_object(
        'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name, 'designation', v_rec.designation,
        'level', v_rec.level, 'is_manager', v_rec.is_manager,
        'tier_label', v_tier.tier_label, 'tier_id', v_tier.id,
        'old_values', v_old, 'new_values', v_new);
    END IF;

    IF NOT p_dry_run THEN
      IF v_run IS NULL THEN
        INSERT INTO public.bu_console_edit_runs (
          performed_by, scope_kind, category_id, kra_name, kpi_name,
          review_period, review_year, changes, reset_overrides)
        VALUES (v_user, 'scoring_ladder', p_category_id, p_kra_name, p_kpi_name,
                p_period, p_year, jsonb_build_object('ladder_key', v_key), p_reset_overrides)
        RETURNING id INTO v_run;
      END IF;

      INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
      VALUES (v_run, v_rec.kpi_id, v_rec.employee_id, v_old, v_new);

      UPDATE public.kpis k SET
        target_value = COALESCE((v_new->>'target_value')::numeric, k.target_value),
        weightage = COALESCE((v_new->>'weightage')::numeric, k.weightage),
        r5 = COALESCE(v_new->>'r5', k.r5),
        r4 = COALESCE(v_new->>'r4', k.r4),
        r3 = COALESCE(v_new->>'r3', k.r3),
        r2 = COALESCE(v_new->>'r2', k.r2),
        r1 = COALESCE(v_new->>'r1', k.r1),
        r0 = COALESCE(v_new->>'r0', k.r0),
        kpi_formula = COALESCE(v_new->>'kpi_formula', k.kpi_formula),
        kpi_scoring_logic = COALESCE(v_new->>'kpi_scoring_logic', k.kpi_scoring_logic)
      WHERE k.id = v_rec.kpi_id;

      IF p_reset_overrides THEN
        DELETE FROM public.bu_console_kpi_overrides o
        WHERE o.kpi_id = v_rec.kpi_id
          AND o.field IN (SELECT jsonb_object_keys(v_new));
      END IF;
    END IF;
  END LOOP;

  -- Tier roll-up view: headcount and the target each tier resolves to.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'tier_label'), '[]'::jsonb) INTO v_tier_stats
  FROM (
    SELECT jsonb_build_object(
      'tier_id', t.id, 'tier_label', t.tier_label,
      'match_dimension', t.match_dimension, 'match_value', t.match_value,
      'tier_target', t.target_value,
      'headcount', (
        SELECT count(*) FROM _ladder_rows r
        WHERE (t.match_dimension = 'default')
           OR (t.match_dimension = 'level' AND lower(COALESCE(r.level,'')) = lower(COALESCE(t.match_value,'')))
           OR (t.match_dimension = 'designation' AND lower(COALESCE(r.designation,'')) = lower(COALESCE(t.match_value,'')))
           OR (t.match_dimension = 'department' AND r.department_id::text = t.match_value)
           OR (t.match_dimension = 'is_manager' AND r.is_manager = (lower(COALESCE(t.match_value,'true')) = 'true'))
           OR (t.match_dimension = 'employee' AND r.employee_id::text = t.match_value)
      )) AS x
    FROM public.bu_console_kpi_scoring_tiers t
    WHERE t.kpi_key = v_key
      AND (t.review_period IS NULL OR t.review_period = p_period)
      AND (t.review_year IS NULL OR t.review_year = p_year)
  ) s;

  IF v_run IS NOT NULL THEN
    UPDATE public.bu_console_edit_runs
    SET affected_rows = v_applied, skipped_rows = v_skip_n
    WHERE id = v_run;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true, 'dry_run', p_dry_run, 'run_id', v_run,
    'kpi_key', v_key,
    'cascade_mode', COALESCE(v_cfg.cascade_mode,'explicit'),
    'rollup_mode', COALESCE(v_cfg.rollup_mode,'independent'),
    'parent_target', v_cfg.parent_target,
    'will_apply', v_applied, 'will_skip', v_skip_n,
    'applied', CASE WHEN p_dry_run THEN 0 ELSE v_applied END,
    'skipped', v_skip_n,
    'tiers', v_tier_stats,
    'preview', v_preview, 'skipped_details', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_ladder_get(uuid,text,text,text,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bu_console_ladder_upsert(uuid,text,text,text,integer,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bu_console_ladder_apply(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],boolean,boolean,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_ladder_get(uuid,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_ladder_upsert(uuid,text,text,text,integer,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_ladder_apply(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],boolean,boolean,text[]) TO authenticated;
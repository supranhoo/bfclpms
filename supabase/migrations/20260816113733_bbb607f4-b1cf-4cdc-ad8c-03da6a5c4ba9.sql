
CREATE TABLE IF NOT EXISTS public.bu_console_target_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_key text NOT NULL,
  kpi_name text NOT NULL,
  review_period text,
  review_year integer,
  match_dimension text NOT NULL CHECK (match_dimension IN ('default','level','designation','department','is_manager')),
  match_value text,
  target_value text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bu_console_target_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bu_console_target_rules TO authenticated;
GRANT ALL ON public.bu_console_target_rules TO service_role;

ALTER TABLE public.bu_console_target_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS target_rules_read ON public.bu_console_target_rules;
CREATE POLICY target_rules_read ON public.bu_console_target_rules
  FOR SELECT TO authenticated
  USING (public.bu_console_can_read(auth.uid()));

DROP POLICY IF EXISTS target_rules_admin_write ON public.bu_console_target_rules;
CREATE POLICY target_rules_admin_write ON public.bu_console_target_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS bu_console_target_rules_uniq
  ON public.bu_console_target_rules (
    kpi_key, match_dimension, COALESCE(match_value, ''),
    COALESCE(review_period, ''), COALESCE(review_year, 0)
  );

CREATE INDEX IF NOT EXISTS bu_console_target_rules_key_idx
  ON public.bu_console_target_rules (kpi_key);

DROP TRIGGER IF EXISTS bu_console_target_rules_touch ON public.bu_console_target_rules;
CREATE TRIGGER bu_console_target_rules_touch
  BEFORE UPDATE ON public.bu_console_target_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Preview / apply the resolved target for every mapped employee in scope.
CREATE OR REPLACE FUNCTION public.bu_console_target_rules_apply(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL,
  p_manager_ids uuid[] DEFAULT NULL,
  p_reset_overrides boolean DEFAULT false,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_key text;
  v_run uuid;
  v_rec record;
  v_target text;
  v_reason text;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_applied int := 0;
  v_skip_n int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;

  v_key := COALESCE(p_category_id::text, '-') || '|' ||
           public.normalize_kpi_text(p_kra_name) || '|' ||
           public.normalize_kpi_text(p_kpi_name);

  FOR v_rec IN
    SELECT k.id AS kpi_id, k.employee_id, k.target_value::text AS current_target,
           k.status::text AS status,
           p.full_name, p.employee_code, p.designation, p.level, p.department_id,
           d.name AS department_name,
           EXISTS (SELECT 1 FROM public.profiles r
                    WHERE r.reporting_manager_id = p.id AND r.is_active = true) AS is_manager,
           rs.final_score,
           EXISTS (SELECT 1 FROM public.bu_console_kpi_overrides o
                    WHERE o.kpi_id = k.id AND o.field = 'target_value') AS is_tuned
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name))
          = public.normalize_kpi_text(p_kpi_name)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
           OR d.business_unit_id IN (SELECT b2.id FROM public.business_units b2 WHERE b2.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
    ORDER BY p.full_name
  LOOP
    SELECT r.target_value INTO v_target
    FROM public.bu_console_target_rules r
    WHERE r.kpi_key = v_key
      AND (r.review_period IS NULL OR r.review_period = p_period)
      AND (r.review_year IS NULL OR r.review_year = p_year)
      AND (
        r.match_dimension = 'default'
        OR (r.match_dimension = 'level' AND lower(COALESCE(v_rec.level, '')) = lower(COALESCE(r.match_value, '')))
        OR (r.match_dimension = 'designation' AND lower(COALESCE(v_rec.designation, '')) = lower(COALESCE(r.match_value, '')))
        OR (r.match_dimension = 'department' AND v_rec.department_id::text = r.match_value)
        OR (r.match_dimension = 'is_manager' AND v_rec.is_manager = (lower(COALESCE(r.match_value,'true')) = 'true'))
      )
    ORDER BY (r.match_dimension = 'default') ASC, r.priority ASC, r.updated_at DESC
    LIMIT 1;

    v_reason := NULL;
    IF v_target IS NULL THEN
      v_reason := 'no_matching_rule';
    ELSIF v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    ELSIF v_rec.is_tuned AND NOT p_reset_overrides THEN
      v_reason := 'manual_override';
    ELSIF COALESCE(v_rec.current_target, '') = v_target THEN
      v_reason := 'already_matches';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      IF v_skip_n <= 500 THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    v_applied := v_applied + 1;
    IF v_applied <= 500 THEN
      v_preview := v_preview || jsonb_build_object(
        'kpi_id', v_rec.kpi_id, 'employee_id', v_rec.employee_id,
        'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
        'department_name', v_rec.department_name,
        'designation', v_rec.designation, 'level', v_rec.level,
        'is_manager', v_rec.is_manager,
        'current_target', v_rec.current_target, 'new_target', v_target);
    END IF;

    IF NOT p_dry_run THEN
      IF v_run IS NULL THEN
        INSERT INTO public.bu_console_edit_runs (
          performed_by, scope_kind, category_id, kra_name, kpi_name,
          review_period, review_year, changes, reset_overrides)
        VALUES (v_user, 'target_rules', p_category_id, p_kra_name, p_kpi_name,
                p_period, p_year, jsonb_build_object('rule_key', v_key), p_reset_overrides)
        RETURNING id INTO v_run;
      END IF;

      INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
      VALUES (v_run, v_rec.kpi_id, v_rec.employee_id,
              jsonb_build_object('target_value', v_rec.current_target),
              jsonb_build_object('target_value', v_target));

      UPDATE public.kpis SET target_value = v_target WHERE id = v_rec.kpi_id;

      IF p_reset_overrides THEN
        DELETE FROM public.bu_console_kpi_overrides
        WHERE kpi_id = v_rec.kpi_id AND field = 'target_value';
      END IF;
    END IF;
  END LOOP;

  IF v_run IS NOT NULL THEN
    UPDATE public.bu_console_edit_runs
    SET affected_rows = v_applied, skipped_rows = v_skip_n
    WHERE id = v_run;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true, 'dry_run', p_dry_run, 'run_id', v_run,
    'will_apply', v_applied, 'will_skip', v_skip_n,
    'applied', CASE WHEN p_dry_run THEN 0 ELSE v_applied END,
    'skipped', v_skip_n,
    'preview', v_preview, 'skipped_details', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_target_rules_apply(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_target_rules_apply(uuid,text,text,text,integer,uuid[],uuid[],uuid[],uuid[],boolean,boolean) TO authenticated;

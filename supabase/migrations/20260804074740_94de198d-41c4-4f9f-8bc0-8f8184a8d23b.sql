-- ADR-245 / POLICY §INC-DAILY-ENTRY-NO-SILENT-LOSS
-- Production daily entries: non-destructive writes + immutable history.

CREATE TABLE IF NOT EXISTS public.production_daily_entries_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid,
  program_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  month text NOT NULL,
  year integer NOT NULL,
  operation text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  removed_days text[] NOT NULL DEFAULT '{}',
  tonnage_before numeric NOT NULL DEFAULT 0,
  tonnage_after numeric NOT NULL DEFAULT 0,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pde_history_scope
  ON public.production_daily_entries_history (program_id, year, month, employee_id, changed_at DESC);

GRANT SELECT ON public.production_daily_entries_history TO authenticated;
GRANT ALL ON public.production_daily_entries_history TO service_role;

ALTER TABLE public.production_daily_entries_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view production daily history" ON public.production_daily_entries_history;
CREATE POLICY "Admins can view production daily history"
  ON public.production_daily_entries_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages production daily history" ON public.production_daily_entries_history;
CREATE POLICY "Service role manages production daily history"
  ON public.production_daily_entries_history FOR ALL
  USING (auth.role() = 'service_role');

-- Sum helper (tons across all day keys)
CREATE OR REPLACE FUNCTION public.production_daily_tonnage(_vals jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN value ~ '^-?[0-9]+(\.[0-9]+)?$' THEN value::numeric ELSE 0 END), 0)
  FROM jsonb_each_text(COALESCE(_vals, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.log_production_daily_entry_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.daily_values END;
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.daily_values END;
  v_removed text[];
  v_reason text;
BEGIN
  SELECT COALESCE(array_agg(k ORDER BY k::int), '{}')
    INTO v_removed
  FROM jsonb_object_keys(COALESCE(v_old, '{}'::jsonb)) AS k
  WHERE NOT (COALESCE(v_new, '{}'::jsonb) ? k);

  BEGIN
    v_reason := NULLIF(current_setting('app.pde_reason', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_reason := NULL;
  END;

  INSERT INTO public.production_daily_entries_history (
    entry_id, program_id, employee_id, month, year, operation,
    old_values, new_values, removed_days,
    tonnage_before, tonnage_after, reason, changed_by
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.program_id, OLD.program_id),
    COALESCE(NEW.employee_id, OLD.employee_id),
    COALESCE(NEW.month, OLD.month),
    COALESCE(NEW.year, OLD.year),
    lower(TG_OP),
    v_old, v_new, COALESCE(v_removed, '{}'),
    public.production_daily_tonnage(v_old),
    public.production_daily_tonnage(v_new),
    v_reason,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_production_daily_entries_history ON public.production_daily_entries;
CREATE TRIGGER trg_production_daily_entries_history
AFTER INSERT OR UPDATE OR DELETE ON public.production_daily_entries
FOR EACH ROW EXECUTE FUNCTION public.log_production_daily_entry_change();

-- Non-destructive merge writer (SECURITY INVOKER: existing RLS applies).
-- p_rows: [{program_id, employee_id, month, year, values: {"1": 12.5, ...}}]
-- p_days: the day numbers the operator actually had loaded; only these keys
-- are written. Days outside this window are preserved untouched.
CREATE OR REPLACE FUNCTION public.upsert_production_daily_values(
  p_rows jsonb,
  p_days integer[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_patch jsonb;
  v_count integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;
  IF p_days IS NULL OR array_length(p_days, 1) IS NULL THEN
    RAISE EXCEPTION 'p_days must list at least one day';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT COALESCE(jsonb_object_agg(d::text, COALESCE((r->'values'->>d::text)::numeric, 0)), '{}'::jsonb)
      INTO v_patch
    FROM unnest(p_days) AS d
    WHERE (r->'values') ? d::text;

    IF v_patch = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    INSERT INTO public.production_daily_entries (
      program_id, employee_id, month, year, daily_values, updated_by, updated_at
    ) VALUES (
      (r->>'program_id')::uuid,
      (r->>'employee_id')::uuid,
      r->>'month',
      (r->>'year')::integer,
      v_patch,
      auth.uid(),
      now()
    )
    ON CONFLICT (program_id, employee_id, month, year) DO UPDATE
      SET daily_values = public.production_daily_entries.daily_values || EXCLUDED.daily_values,
          updated_by = auth.uid(),
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_production_daily_values(jsonb, integer[]) TO authenticated;

-- Admin-only audited restore of lost days from an authorised source file.
CREATE OR REPLACE FUNCTION public.admin_restore_production_daily_values(
  p_rows jsonb,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_patch jsonb;
  v_count integer := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can restore production daily values';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for a production data restore';
  END IF;

  PERFORM set_config('app.pde_reason', p_reason, true);

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT COALESCE(jsonb_object_agg(key, COALESCE(value::numeric, 0)), '{}'::jsonb)
      INTO v_patch
    FROM jsonb_each_text(r->'values');

    IF v_patch = '{}'::jsonb THEN
      CONTINUE;
    END IF;

    INSERT INTO public.production_daily_entries (
      program_id, employee_id, month, year, daily_values, updated_by, updated_at
    ) VALUES (
      (r->>'program_id')::uuid,
      (r->>'employee_id')::uuid,
      r->>'month',
      (r->>'year')::integer,
      v_patch,
      auth.uid(),
      now()
    )
    ON CONFLICT (program_id, employee_id, month, year) DO UPDATE
      SET daily_values = public.production_daily_entries.daily_values || EXCLUDED.daily_values,
          updated_by = auth.uid(),
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  PERFORM set_config('app.pde_reason', '', true);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_production_daily_values(jsonb, text) TO authenticated;

-- Coverage-drop diagnostic: flags sub-periods whose employee coverage collapses
-- versus the other sub-periods of the same program/month.
CREATE OR REPLACE FUNCTION public.incentive_daily_coverage_diagnostic(
  _program_id uuid,
  _month text,
  _year integer
)
RETURNS TABLE (
  period_label text,
  employees_with_data integer,
  total_tonnage numeric,
  max_period_employees integer,
  coverage_ratio numeric,
  is_suspicious boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH windows AS (
    SELECT '1-10'::text AS label, 1 AS lo, 10 AS hi
    UNION ALL SELECT '11-20', 11, 20
    UNION ALL SELECT '21-31', 21, 31
  ),
  base AS (
    SELECT w.label,
           COUNT(*) FILTER (WHERE t.tons > 0)::int AS emps,
           COALESCE(SUM(t.tons), 0) AS tons
    FROM windows w
    LEFT JOIN LATERAL (
      SELECT d.employee_id,
             (SELECT COALESCE(SUM(kv.value::numeric), 0)
              FROM jsonb_each_text(d.daily_values) kv
              WHERE kv.key ~ '^[0-9]+$'
                AND kv.key::int BETWEEN w.lo AND w.hi
                AND kv.value ~ '^-?[0-9]+(\.[0-9]+)?$') AS tons
      FROM public.production_daily_entries d
      WHERE d.program_id = _program_id AND d.month = _month AND d.year = _year
    ) t ON TRUE
    GROUP BY w.label
  )
  SELECT b.label,
         b.emps,
         b.tons,
         MAX(b.emps) OVER ()::int,
         CASE WHEN MAX(b.emps) OVER () = 0 THEN 1
              ELSE ROUND(b.emps::numeric / MAX(b.emps) OVER (), 3) END,
         (MAX(b.emps) OVER () > 0 AND b.emps::numeric / MAX(b.emps) OVER () < 0.7)
  FROM base b
  ORDER BY b.label;
$$;

GRANT EXECUTE ON FUNCTION public.incentive_daily_coverage_diagnostic(uuid, text, integer) TO authenticated;
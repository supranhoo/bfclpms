-- ADR-269: forward-only KPI text split (Title / Description / Formula / Scoring Logic)
-- Effective FY 2026-27 (July 2026 onward). Legacy rows are never selected or written.

ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS kpi_title text,
  ADD COLUMN IF NOT EXISTS kpi_description text,
  ADD COLUMN IF NOT EXISTS kpi_formula text,
  ADD COLUMN IF NOT EXISTS kpi_scoring_logic text;

ALTER TABLE public.kpi_templates
  ADD COLUMN IF NOT EXISTS kpi_title text,
  ADD COLUMN IF NOT EXISTS kpi_description text,
  ADD COLUMN IF NOT EXISTS kpi_formula text,
  ADD COLUMN IF NOT EXISTS kpi_scoring_logic text;

-- Fiscal start year of a (review_period, review_year) tuple. Jul-Dec -> year, Jan-Jun -> year-1.
CREATE OR REPLACE FUNCTION public.kpi_fiscal_start_year(p_period text, p_year integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_period IS NULL OR p_year IS NULL THEN NULL
    WHEN array_position(
           ARRAY['July','August','September','October','November','December']::text[],
           p_period) IS NOT NULL THEN p_year
    WHEN array_position(
           ARRAY['January','February','March','April','May','June']::text[],
           p_period) IS NOT NULL THEN p_year - 1
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.kpi_fiscal_start_year(text, integer)
  IS 'ADR-269: fiscal (July) start year for a KPI row. Cutover for the text split is >= 2026.';

-- Shared parser: KPI free text -> structured parts. Mirrored in src/lib/kpiTextSplit.ts.
CREATE OR REPLACE FUNCTION public.kpi_split_text(p_text text)
RETURNS TABLE (title text, description text, formula text, scoring_logic text, confidence text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_scoring text;
  v_formula text;
  v_head text;
  v_head2 text;
  v_title text;
  v_desc text;
  v_conf text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, 'empty'::text;
    RETURN;
  END IF;

  v_scoring := (regexp_match(p_text, '(?is)(?:^|\n|\s|-)\s*scoring(?:\s+logic)?\s*[:\-]+\s*(.*)$'))[1];
  IF v_scoring IS NOT NULL THEN
    v_head := regexp_replace(p_text, '(?is)(?:^|\n|\s|-)\s*scoring(?:\s+logic)?\s*[:\-]+\s*.*$', '');
  ELSE
    v_head := p_text;
  END IF;

  v_formula := (regexp_match(v_head, '(?is)(?:^|\n|\s|-)\s*formula\s*[:\-]+\s*(.*)$'))[1];
  IF v_formula IS NOT NULL THEN
    v_head2 := regexp_replace(v_head, '(?is)(?:^|\n|\s|-)\s*formula\s*[:\-]+\s*.*$', '');
  ELSE
    v_head2 := v_head;
  END IF;

  v_title := btrim(split_part(v_head2, E'\n', 1));
  v_title := btrim(regexp_replace(v_title, '(?is)^-\s*', ''));

  v_desc := btrim(substr(v_head2, length(split_part(v_head2, E'\n', 1)) + 1));
  v_desc := btrim(regexp_replace(v_desc, '(?is)^[\s\-]*description\s*[:\-]+\s*', ''));

  IF v_desc = '' THEN v_desc := NULL; END IF;
  v_formula := NULLIF(btrim(coalesce(v_formula, '')), '');
  v_scoring := NULLIF(btrim(coalesce(v_scoring, '')), '');

  IF v_formula IS NOT NULL AND v_scoring IS NOT NULL AND v_title <> '' AND length(v_title) <= 120 THEN
    v_conf := 'high';
  ELSIF v_formula IS NULL AND v_scoring IS NULL THEN
    v_conf := 'unparsed';
  ELSE
    v_conf := 'review';
  END IF;

  RETURN QUERY SELECT NULLIF(v_title, ''), v_desc, v_formula, v_scoring, v_conf;
END;
$$;

-- Audit trail for every applied split.
CREATE TABLE IF NOT EXISTS public.kpi_text_split_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  kpi_id uuid NOT NULL,
  review_period text,
  review_year integer,
  kpi_name text NOT NULL,
  before_parts jsonb,
  after_parts jsonb NOT NULL,
  confidence text NOT NULL,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kpi_text_split_audit TO authenticated;
GRANT ALL ON public.kpi_text_split_audit TO service_role;

ALTER TABLE public.kpi_text_split_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kpi_text_split_audit_admin_read" ON public.kpi_text_split_audit;
CREATE POLICY "kpi_text_split_audit_admin_read"
  ON public.kpi_text_split_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_kpi_text_split_audit_run ON public.kpi_text_split_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_kpi_text_split_audit_kpi ON public.kpi_text_split_audit(kpi_id);

-- Dry run: preview the split for the cutover window only. Never writes.
CREATE OR REPLACE FUNCTION public.kpi_split_dry_run(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_confidence text DEFAULT NULL
)
RETURNS TABLE (
  kpi_id uuid,
  review_period text,
  review_year integer,
  kra_name text,
  kpi_name text,
  title text,
  description text,
  formula text,
  scoring_logic text,
  confidence text,
  already_split boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can preview the KPI text split';
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT k.id, k.review_period, k.review_year, k.kra_name, k.kpi_name,
           k.kpi_title IS NOT NULL AS split_done,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
  ), filtered AS (
    SELECT * FROM src WHERE p_confidence IS NULL OR src.confidence = p_confidence
  )
  SELECT f.id, f.review_period, f.review_year, f.kra_name, f.kpi_name,
         f.title, f.description, f.formula, f.scoring_logic, f.confidence,
         f.split_done, (SELECT count(*) FROM filtered)
  FROM filtered f
  ORDER BY f.review_year, f.kra_name, f.kpi_name
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$$;

-- Summary counts for the cutover window.
CREATE OR REPLACE FUNCTION public.kpi_split_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can read the KPI text split summary';
  END IF;

  SELECT jsonb_build_object(
    'cutover_fiscal_start_year', 2026,
    'in_scope', count(*),
    'distinct_names', count(DISTINCT k.kpi_name),
    'high', count(*) FILTER (WHERE s.confidence = 'high'),
    'review', count(*) FILTER (WHERE s.confidence = 'review'),
    'unparsed', count(*) FILTER (WHERE s.confidence IN ('unparsed','empty')),
    'already_split', count(*) FILTER (WHERE k.kpi_title IS NOT NULL),
    'legacy_untouched', (SELECT count(*) FROM public.kpis lk
                          WHERE coalesce(public.kpi_fiscal_start_year(lk.review_period, lk.review_year), 0) < 2026)
  )
  INTO v
  FROM public.kpis k
  CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
  WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026;

  RETURN v;
END;
$$;

-- Apply: writes ONLY the four structured columns. kpi_name is never modified.
CREATE OR REPLACE FUNCTION public.kpi_split_apply(
  p_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_confidence text DEFAULT 'high'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run uuid := gen_random_uuid();
  v_applied integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply the KPI text split';
  END IF;

  WITH target AS (
    SELECT k.id, k.review_period, k.review_year, k.kpi_name,
           k.kpi_title, k.kpi_description, k.kpi_formula, k.kpi_scoring_logic,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
      AND (p_ids IS NULL OR k.id = ANY(p_ids))
      AND (p_confidence IS NULL OR s.confidence = p_confidence)
      AND s.title IS NOT NULL
    ORDER BY k.review_year, k.kra_name, k.kpi_name
    LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000))
  ), upd AS (
    UPDATE public.kpis k
    SET kpi_title = t.title,
        kpi_description = t.description,
        kpi_formula = t.formula,
        kpi_scoring_logic = t.scoring_logic
    FROM target t
    WHERE k.id = t.id
    RETURNING t.*
  ), logged AS (
    INSERT INTO public.kpi_text_split_audit
      (run_id, kpi_id, review_period, review_year, kpi_name, before_parts, after_parts, confidence, performed_by)
    SELECT v_run, u.id, u.review_period, u.review_year, u.kpi_name,
           jsonb_build_object('title', u.kpi_title, 'description', u.kpi_description,
                              'formula', u.kpi_formula, 'scoring_logic', u.kpi_scoring_logic),
           jsonb_build_object('title', u.title, 'description', u.description,
                              'formula', u.formula, 'scoring_logic', u.scoring_logic),
           u.confidence, auth.uid()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_applied FROM logged;

  RETURN jsonb_build_object('run_id', v_run, 'applied', v_applied, 'confidence', p_confidence);
END;
$$;

-- Rollback: restores the pre-run structured values for a run. kpi_name untouched.
CREATE OR REPLACE FUNCTION public.kpi_split_rollback(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reverted integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can roll back the KPI text split';
  END IF;

  WITH rev AS (
    UPDATE public.kpis k
    SET kpi_title = a.before_parts->>'title',
        kpi_description = a.before_parts->>'description',
        kpi_formula = a.before_parts->>'formula',
        kpi_scoring_logic = a.before_parts->>'scoring_logic'
    FROM public.kpi_text_split_audit a
    WHERE a.run_id = p_run_id AND k.id = a.kpi_id
    RETURNING 1
  )
  SELECT count(*) INTO v_reverted FROM rev;

  RETURN jsonb_build_object('run_id', p_run_id, 'reverted', v_reverted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_split_dry_run(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_split_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_split_apply(uuid[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_split_rollback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_split_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_fiscal_start_year(text, integer) TO authenticated;
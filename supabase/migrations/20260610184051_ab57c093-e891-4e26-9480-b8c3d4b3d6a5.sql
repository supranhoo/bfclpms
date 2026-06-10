
-- ============================================================
-- ADR-088: Cycle anchor preservation across rollover
-- ============================================================

-- 1) Helper: is `p_anchor` a legal cycle anchor for `p_frequency`?
--    Legal = first abbreviation of the anchor maps to a real month and the
--    cycle length matches the frequency. Anchors are stored as `MMM-MMM`.
CREATE OR REPLACE FUNCTION public.is_valid_cycle_anchor(
  p_frequency text,
  p_anchor    text
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  cycle_len int;
  start_abbr text;
  start_idx int;
BEGIN
  IF p_anchor IS NULL OR p_frequency IS NULL THEN RETURN false; END IF;

  cycle_len := CASE trim(p_frequency)
    WHEN 'Bi-Monthly'  THEN 2
    WHEN 'Quarterly'   THEN 3
    WHEN 'Half-Yearly' THEN 6
    WHEN 'Yearly'      THEN 12
    ELSE 1
  END;
  IF cycle_len <= 1 THEN RETURN false; END IF;

  start_abbr := split_part(p_anchor, '-', 1);
  start_idx  := array_position(months, start_abbr);
  IF start_idx IS NULL THEN RETURN false; END IF;

  -- Anchor format check: must contain '-' and have a valid second abbr too.
  IF array_position(months, split_part(p_anchor, '-', 2)) IS NULL THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 2) Sticky 3-arg overload of resolve_cycle_anchor.
--    Returns p_existing_anchor unchanged if it is a legal anchor for the
--    frequency. Otherwise falls back to the Jan-anchored standard cycle.
--    The original 2-arg function is left in place for backwards compatibility.
CREATE OR REPLACE FUNCTION public.resolve_cycle_anchor(
  p_frequency       text,
  p_month_idx       integer,
  p_existing_anchor text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_valid_cycle_anchor(p_frequency, p_existing_anchor) THEN
    RETURN p_existing_anchor;
  END IF;
  RETURN public.resolve_cycle_anchor(p_frequency, p_month_idx);
END;
$$;

-- 3) Update repair_org_kpi_cycle_anchors: do NOT rewrite valid offset anchors.
CREATE OR REPLACE FUNCTION public.repair_org_kpi_cycle_anchors(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  months text[] := ARRAY['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
  rec record;
  resolved_anchor text;
  month_idx int;
  total_scanned int := 0;
  total_drift int := 0;
  total_repaired int := 0;
  by_freq jsonb := '{}'::jsonb;
  freq_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOR rec IN
    SELECT id, employee_id, frequency, frequency_cycle_start, review_period, review_year,
           kra_name, kpi_name
    FROM public.kpis
    WHERE is_org_level = true
      AND frequency IN ('Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly')
  LOOP
    total_scanned := total_scanned + 1;
    month_idx := array_position(months, rec.review_period) - 1;
    IF month_idx IS NULL OR month_idx < 0 THEN CONTINUE; END IF;

    -- ADR-088: sticky resolver — only replaces invalid/null anchors.
    resolved_anchor := public.resolve_cycle_anchor(
      rec.frequency, month_idx, rec.frequency_cycle_start
    );
    IF resolved_anchor IS NULL THEN CONTINUE; END IF;

    IF rec.frequency_cycle_start IS DISTINCT FROM resolved_anchor THEN
      total_drift := total_drift + 1;
      freq_count := COALESCE((by_freq ->> rec.frequency)::int, 0);
      by_freq := jsonb_set(by_freq, ARRAY[rec.frequency], to_jsonb(freq_count + 1));

      IF NOT p_dry_run THEN
        UPDATE public.kpis
        SET frequency_cycle_start = resolved_anchor
        WHERE id = rec.id;

        INSERT INTO public.kpi_audit_logs (
          kpi_id, action, old_value, new_value, performed_by, metadata
        ) VALUES (
          rec.id,
          'KPI_CYCLE_ANCHOR_REPAIRED',
          jsonb_build_object('frequency_cycle_start', rec.frequency_cycle_start),
          jsonb_build_object('frequency_cycle_start', resolved_anchor),
          NULL,
          jsonb_build_object(
            'frequency', rec.frequency,
            'review_period', rec.review_period,
            'review_year', rec.review_year,
            'system_action', true,
            'policy', 'ADR-088'
          )
        );
        total_repaired := total_repaired + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_scanned', total_scanned,
    'total_drift', total_drift,
    'total_repaired', total_repaired,
    'by_frequency', by_freq
  );
END;
$$;

-- 4) Read-only RPC: detect tuples whose rows disagree on frequency_cycle_start
--    within the same review_year. Admin-only.
CREATE OR REPLACE FUNCTION public.detect_org_kpi_cycle_anchor_drift()
RETURNS TABLE (
  category_id uuid,
  kra_name text,
  kpi_name text,
  review_year integer,
  frequency text,
  distinct_anchors text[],
  affected_kpi_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  RETURN QUERY
  WITH grouped AS (
    SELECT
      k.category_id,
      lower(trim(k.kra_name)) AS kra_key,
      lower(trim(k.kpi_name)) AS kpi_key,
      k.review_year,
      k.frequency,
      array_agg(DISTINCT k.frequency_cycle_start) FILTER (WHERE k.frequency_cycle_start IS NOT NULL) AS anchors,
      count(*) AS row_count
    FROM public.kpis k
    WHERE k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
    GROUP BY k.category_id, lower(trim(k.kra_name)), lower(trim(k.kpi_name)), k.review_year, k.frequency
  )
  SELECT
    g.category_id,
    max(k2.kra_name) AS kra_name,
    max(k2.kpi_name) AS kpi_name,
    g.review_year,
    g.frequency,
    g.anchors,
    g.row_count
  FROM grouped g
  JOIN public.kpis k2
    ON k2.category_id = g.category_id
   AND lower(trim(k2.kra_name)) = g.kra_key
   AND lower(trim(k2.kpi_name)) = g.kpi_key
   AND k2.review_year = g.review_year
  WHERE array_length(g.anchors, 1) > 1
  GROUP BY g.category_id, g.kra_key, g.kpi_key, g.review_year, g.frequency, g.anchors, g.row_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_org_kpi_cycle_anchor_drift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_cycle_anchor(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cycle_anchor(text, integer, text) TO authenticated;

-- 5) One-shot scoped repair for Prabhat Kumar Singh's two divergent rows.
--    Reversal (commented for audit reference):
--      UPDATE public.kpis SET frequency_cycle_start='May-Jun'
--      WHERE id IN ('e08a5e40-3983-4b76-a324-81e67cde2ef6',
--                   '42caf513-0329-4f50-b647-9fa9706dc616');
WITH targets AS (
  SELECT id, frequency_cycle_start AS old_anchor
  FROM public.kpis
  WHERE id IN (
    'e08a5e40-3983-4b76-a324-81e67cde2ef6',  -- Prabhat May 2026
    '42caf513-0329-4f50-b647-9fa9706dc616'   -- Prabhat June 2026
  )
    AND frequency_cycle_start IS DISTINCT FROM 'Feb-Mar'
),
upd AS (
  UPDATE public.kpis k
  SET frequency_cycle_start = 'Feb-Mar',
      updated_at = now()
  FROM targets t
  WHERE k.id = t.id
  RETURNING k.id, t.old_anchor
)
INSERT INTO public.kpi_audit_logs (kpi_id, action, old_value, new_value, performed_by, metadata)
SELECT
  upd.id,
  'KPI_CYCLE_ANCHOR_REPAIRED',
  jsonb_build_object('frequency_cycle_start', upd.old_anchor),
  jsonb_build_object('frequency_cycle_start', 'Feb-Mar'),
  NULL,
  jsonb_build_object(
    'system_action', true,
    'policy', 'ADR-088',
    'reason', 'RCA — rollover anchor drift (Prabhat Kumar Singh Bi-Monthly production KPI)'
  )
FROM upd;

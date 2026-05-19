
-- =============================================================
-- Org KPI evidence: multi-file with labels + resync + parity
-- =============================================================

-- 1) New rich column on org_kpi_values
ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS evidence_files jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.org_kpi_values.evidence_files IS
  'Array of {url, label, added_by, added_at}. Source of truth for OKV evidence. evidence_url / evidence_urls are derived projections kept in sync by trg_sync_okv_evidence_projection.';

-- 2) Sync trigger: keep legacy evidence_url & evidence_urls aligned to evidence_files
CREATE OR REPLACE FUNCTION public.sync_okv_evidence_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_urls jsonb;
  v_first text;
BEGIN
  IF NEW.evidence_files IS NULL THEN
    NEW.evidence_files := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(NEW.evidence_files) = 'array' AND jsonb_array_length(NEW.evidence_files) > 0 THEN
    SELECT jsonb_agg(elem->>'url') FILTER (WHERE elem->>'url' IS NOT NULL AND elem->>'url' <> ''),
           (NEW.evidence_files->0->>'url')
      INTO v_urls, v_first
      FROM jsonb_array_elements(NEW.evidence_files) elem;
    NEW.evidence_urls := COALESCE(v_urls, '[]'::jsonb);
    NEW.evidence_url  := v_first;
  ELSIF TG_OP = 'INSERT' THEN
    -- No rich files supplied: keep whatever evidence_url(s) admin set the old way.
    -- Also seed evidence_files from a legacy single URL so the new UI shows it.
    IF NEW.evidence_url IS NOT NULL AND NEW.evidence_url <> '' THEN
      NEW.evidence_files := jsonb_build_array(
        jsonb_build_object('url', NEW.evidence_url, 'label', NULL,
                           'added_by', NULL, 'added_at', now())
      );
      NEW.evidence_urls := jsonb_build_array(NEW.evidence_url);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_okv_evidence_projection ON public.org_kpi_values;
CREATE TRIGGER trg_sync_okv_evidence_projection
  BEFORE INSERT OR UPDATE OF evidence_files, evidence_url ON public.org_kpi_values
  FOR EACH ROW EXECUTE FUNCTION public.sync_okv_evidence_projection();

-- 3) Backfill: hydrate evidence_files for existing rows that only have legacy URLs
UPDATE public.org_kpi_values
SET evidence_files = jsonb_build_array(
  jsonb_build_object('url', evidence_url, 'label', NULL,
                     'added_by', NULL, 'added_at', COALESCE(updated_at, now()))
)
WHERE (evidence_files IS NULL OR evidence_files = '[]'::jsonb)
  AND evidence_url IS NOT NULL AND evidence_url <> '';

-- =============================================================
-- 4) resync_org_kpi_evidence(p_okv_id, p_mode)
--    mode = 'append_only' | 'replace_with_stepback'
-- =============================================================
CREATE OR REPLACE FUNCTION public.resync_org_kpi_evidence(
  p_okv_id uuid,
  p_mode text DEFAULT 'append_only'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_okv  record;
  v_authorized boolean := false;
  v_kra_norm text;
  v_kpi_norm text;
  v_okv_urls jsonb;
  v_okv_first text;
  v_pushed int := 0;
  v_stepped_back int := 0;
  v_skipped int := 0;
  v_details jsonb := '[]'::jsonb;
  rec record;
  v_merged_urls jsonb;
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_mode NOT IN ('append_only','replace_with_stepback') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;

  SELECT * INTO v_okv FROM public.org_kpi_values WHERE id = p_okv_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_kpi_values row not found: %', p_okv_id;
  END IF;

  v_kra_norm := normalize_kpi_text(v_okv.kra_name);
  v_kpi_norm := normalize_kpi_text(v_okv.kpi_name);

  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = v_okv.category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to resync this org KPI';
  END IF;

  v_okv_urls  := COALESCE(v_okv.evidence_urls, '[]'::jsonb);
  v_okv_first := v_okv.evidence_url;

  -- Walk every per-employee KPI matching this org KPI signature
  FOR rec IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.employee_id,
           rs.kpi_id IS NOT NULL AS has_rs,
           COALESCE(rs.self_evidence_urls, '[]'::jsonb) AS rs_urls,
           rs.self_evidence_url AS rs_first
      FROM public.kpis k
      LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
     WHERE k.is_org_level = true
       AND k.category_id  = v_okv.category_id
       AND k.review_period = v_okv.review_period
       AND k.review_year   = v_okv.review_year
       AND normalize_kpi_text(k.kra_name) = v_kra_norm
       AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
       AND (v_okv.employee_id   IS NULL OR k.employee_id   = v_okv.employee_id)
       AND (v_okv.department_id IS NULL OR EXISTS (
              SELECT 1 FROM public.profiles pf
               WHERE pf.id = k.employee_id AND pf.department_id = v_okv.department_id))
  LOOP
    IF p_mode = 'append_only' THEN
      -- Union OKV urls into row urls; new urls only
      SELECT COALESCE(jsonb_agg(DISTINCT u), '[]'::jsonb)
        INTO v_merged_urls
        FROM (
          SELECT jsonb_array_elements_text(rec.rs_urls) AS u
          UNION
          SELECT jsonb_array_elements_text(v_okv_urls) AS u
        ) s
        WHERE u IS NOT NULL AND u <> '';

      IF v_merged_urls = rec.rs_urls THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.review_submissions (kpi_id, self_evidence_url, self_evidence_urls, updated_at)
      VALUES (rec.kpi_id, COALESCE(rec.rs_first, v_okv_first),
              v_merged_urls, now())
      ON CONFLICT (kpi_id) DO UPDATE SET
        self_evidence_url  = COALESCE(review_submissions.self_evidence_url, EXCLUDED.self_evidence_url),
        self_evidence_urls = EXCLUDED.self_evidence_urls,
        updated_at = now();

      v_pushed := v_pushed + 1;
      v_details := v_details || jsonb_build_object(
        'kpi_id', rec.kpi_id, 'mode','append_only',
        'added_urls', (SELECT COUNT(*) FROM jsonb_array_elements_text(v_merged_urls))
                       - (SELECT COUNT(*) FROM jsonb_array_elements_text(rec.rs_urls))
      );

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_RESYNCED', v_user,
              jsonb_build_object('mode','append_only','okv_id', v_okv.id));
    ELSE
      -- replace_with_stepback
      IF rec.kpi_status = ANY(v_locked_statuses) THEN
        -- Send back to self_review via kpis status update (preserves data per
        -- send-back preservation memory) and overwrite evidence projections.
        UPDATE public.kpis
           SET status = 'self_review'::review_status
         WHERE id = rec.kpi_id;
        v_stepped_back := v_stepped_back + 1;

        INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
        VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_STEPBACK', v_user,
                jsonb_build_object('from_status', rec.kpi_status,
                                   'okv_id', v_okv.id,
                                   'reason','admin replaced org KPI supporting files'));
      END IF;

      INSERT INTO public.review_submissions (kpi_id, self_evidence_url, self_evidence_urls, updated_at)
      VALUES (rec.kpi_id, v_okv_first, v_okv_urls, now())
      ON CONFLICT (kpi_id) DO UPDATE SET
        self_evidence_url  = EXCLUDED.self_evidence_url,
        self_evidence_urls = EXCLUDED.self_evidence_urls,
        updated_at = now();

      v_pushed := v_pushed + 1;
      v_details := v_details || jsonb_build_object(
        'kpi_id', rec.kpi_id, 'mode','replace_with_stepback',
        'stepped_back', (rec.kpi_status = ANY(v_locked_statuses))
      );

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_RESYNCED', v_user,
              jsonb_build_object('mode','replace_with_stepback','okv_id', v_okv.id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pushed', v_pushed,
    'skipped', v_skipped,
    'stepped_back', v_stepped_back,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resync_org_kpi_evidence(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.resync_org_kpi_evidence(uuid, text) IS
  'Re-syncs OKV evidence_urls into per-employee review_submissions.self_evidence_urls. append_only = additive union (safe at any stage). replace_with_stepback = full replace; rows past self_review are sent back to self_review and audited as ORG_KPI_EVIDENCE_STEPBACK.';

-- =============================================================
-- 5) Parity report: per-OKV breakdown of in-sync vs drift
-- =============================================================
CREATE OR REPLACE FUNCTION public.org_kpi_evidence_parity(
  p_review_period text,
  p_review_year integer
)
RETURNS TABLE(
  okv_id uuid,
  category_id uuid,
  kra_name text,
  kpi_name text,
  total_emps int,
  in_sync int,
  drift_value int,
  drift_evidence int,
  not_propagated int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH okv AS (
    SELECT v.id, v.category_id, v.kra_name, v.kpi_name,
           v.achieved_value AS okv_value,
           COALESCE(v.evidence_urls, '[]'::jsonb) AS okv_urls,
           v.employee_id, v.department_id
      FROM public.org_kpi_values v
     WHERE v.review_period = p_review_period
       AND v.review_year   = p_review_year
  ),
  pairs AS (
    SELECT o.id AS okv_id, o.category_id, o.kra_name, o.kpi_name,
           o.okv_value, o.okv_urls,
           k.id AS kpi_id, k.status::text AS kpi_status,
           rs.self_score, rs.achieved_value AS rs_value,
           COALESCE(rs.self_evidence_urls, '[]'::jsonb) AS rs_urls
      FROM okv o
      JOIN public.kpis k
        ON k.is_org_level = true
       AND k.category_id  = o.category_id
       AND k.review_period = p_review_period
       AND k.review_year   = p_review_year
       AND normalize_kpi_text(k.kra_name) = normalize_kpi_text(o.kra_name)
       AND normalize_kpi_text(k.kpi_name) = normalize_kpi_text(o.kpi_name)
       AND (o.employee_id IS NULL OR k.employee_id = o.employee_id)
       AND (o.department_id IS NULL OR EXISTS (
             SELECT 1 FROM public.profiles pf
              WHERE pf.id = k.employee_id AND pf.department_id = o.department_id))
      LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
  )
  SELECT p.okv_id, p.category_id, p.kra_name, p.kpi_name,
         COUNT(*)::int AS total_emps,
         COUNT(*) FILTER (
           WHERE p.self_score IS NOT NULL
             AND p.rs_value IS NOT DISTINCT FROM p.okv_value
             AND public.jsonb_url_set_equal(p.rs_urls, p.okv_urls)
         )::int AS in_sync,
         COUNT(*) FILTER (
           WHERE p.self_score IS NOT NULL
             AND p.rs_value IS DISTINCT FROM p.okv_value
         )::int AS drift_value,
         COUNT(*) FILTER (
           WHERE p.self_score IS NOT NULL
             AND NOT public.jsonb_url_set_equal(p.rs_urls, p.okv_urls)
         )::int AS drift_evidence,
         COUNT(*) FILTER (WHERE p.self_score IS NULL)::int AS not_propagated
    FROM pairs p
   GROUP BY p.okv_id, p.category_id, p.kra_name, p.kpi_name;
END;
$$;

-- Helper: compare two jsonb arrays of URLs as sets (order-independent, distinct)
CREATE OR REPLACE FUNCTION public.jsonb_url_set_equal(a jsonb, b jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT x ORDER BY x)
       FROM jsonb_array_elements_text(COALESCE(a,'[]'::jsonb)) AS x),
    ARRAY[]::text[]
  ) IS NOT DISTINCT FROM COALESCE(
    (SELECT array_agg(DISTINCT y ORDER BY y)
       FROM jsonb_array_elements_text(COALESCE(b,'[]'::jsonb)) AS y),
    ARRAY[]::text[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.org_kpi_evidence_parity(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_url_set_equal(jsonb, jsonb) TO authenticated;

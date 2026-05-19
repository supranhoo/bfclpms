
-- =============================================================
-- Per-file targeting for Org KPI supporting evidence
-- =============================================================

-- 1) Helper: filter evidence_files for a given (employee_id, department_id)
--    Rules:
--      * file with both arrays empty/null => applies to everyone (legacy default)
--      * else => applies if employee_id is in applies_to_employee_ids
--                OR department_id is in applies_to_department_ids
CREATE OR REPLACE FUNCTION public._filter_files_for_employee(
  p_files jsonb,
  p_employee_id uuid,
  p_department_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_emp_ids jsonb;
  v_dept_ids jsonb;
  v_has_target boolean;
  v_match boolean;
BEGIN
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_files) LOOP
    v_emp_ids  := COALESCE(v_elem->'applies_to_employee_ids',  '[]'::jsonb);
    v_dept_ids := COALESCE(v_elem->'applies_to_department_ids', '[]'::jsonb);
    v_has_target := (jsonb_array_length(v_emp_ids) + jsonb_array_length(v_dept_ids)) > 0;

    IF NOT v_has_target THEN
      v_out := v_out || v_elem;
    ELSE
      v_match := false;
      IF p_employee_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_emp_ids) e WHERE e::uuid = p_employee_id
      ) THEN
        v_match := true;
      END IF;
      IF NOT v_match AND p_department_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_dept_ids) d WHERE d::uuid = p_department_id
      ) THEN
        v_match := true;
      END IF;
      IF v_match THEN
        v_out := v_out || v_elem;
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._filter_files_for_employee(jsonb, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public._filter_files_for_employee IS
  'Returns the subset of an Org KPI evidence_files array that applies to a given (employee, department). Empty targeting arrays = applies to everyone.';

-- 2) Audit trigger on evidence_files changes — captures targeting diffs
CREATE OR REPLACE FUNCTION public.audit_okv_evidence_targeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := COALESCE(OLD.evidence_files, '[]'::jsonb);
  v_new jsonb := COALESCE(NEW.evidence_files, '[]'::jsonb);
  v_user uuid := auth.uid();
BEGIN
  IF v_old IS DISTINCT FROM v_new THEN
    -- Only log targeting changes if any file has non-empty targeting OR targeting was removed
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_new) e
      WHERE jsonb_array_length(COALESCE(e->'applies_to_employee_ids','[]'::jsonb)) > 0
         OR jsonb_array_length(COALESCE(e->'applies_to_department_ids','[]'::jsonb)) > 0
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_old) e
      WHERE jsonb_array_length(COALESCE(e->'applies_to_employee_ids','[]'::jsonb)) > 0
         OR jsonb_array_length(COALESCE(e->'applies_to_department_ids','[]'::jsonb)) > 0
    ) THEN
      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        NULL,
        'ORG_KPI_EVIDENCE_TARGETING_CHANGED',
        v_user,
        jsonb_build_object(
          'okv_id', NEW.id,
          'category_id', NEW.category_id,
          'kra_name', NEW.kra_name,
          'kpi_name', NEW.kpi_name,
          'review_period', NEW.review_period,
          'review_year', NEW.review_year,
          'old_files', v_old,
          'new_files', v_new
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_okv_evidence_targeting ON public.org_kpi_values;
CREATE TRIGGER trg_audit_okv_evidence_targeting
  AFTER UPDATE OF evidence_files ON public.org_kpi_values
  FOR EACH ROW EXECUTE FUNCTION public.audit_okv_evidence_targeting();

-- 3) Replace resync_org_kpi_evidence to honor per-employee targeting
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
  v_pushed int := 0;
  v_stepped_back int := 0;
  v_skipped int := 0;
  v_details jsonb := '[]'::jsonb;
  rec record;
  v_filtered jsonb;
  v_target_urls jsonb;
  v_target_first text;
  v_merged_urls jsonb;
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('append_only','replace_with_stepback') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;

  SELECT * INTO v_okv FROM public.org_kpi_values WHERE id = p_okv_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'org_kpi_values row not found: %', p_okv_id; END IF;

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
  IF NOT v_authorized THEN RAISE EXCEPTION 'Not authorized to resync this org KPI'; END IF;

  FOR rec IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.employee_id,
           pf.department_id AS employee_department_id,
           COALESCE(rs.self_evidence_urls, '[]'::jsonb) AS rs_urls,
           rs.self_evidence_url AS rs_first
      FROM public.kpis k
      LEFT JOIN public.profiles pf ON pf.id = k.employee_id
      LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
     WHERE k.is_org_level = true
       AND k.category_id  = v_okv.category_id
       AND k.review_period = v_okv.review_period
       AND k.review_year   = v_okv.review_year
       AND normalize_kpi_text(k.kra_name) = v_kra_norm
       AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
       AND (v_okv.employee_id   IS NULL OR k.employee_id   = v_okv.employee_id)
       AND (v_okv.department_id IS NULL OR pf.department_id = v_okv.department_id)
  LOOP
    v_filtered := public._filter_files_for_employee(
      v_okv.evidence_files, rec.employee_id, rec.employee_department_id
    );

    -- Build the urls projection for THIS employee from the filtered files
    SELECT COALESCE(jsonb_agg(elem->>'url') FILTER (WHERE elem->>'url' IS NOT NULL AND elem->>'url' <> ''), '[]'::jsonb),
           (v_filtered->0->>'url')
      INTO v_target_urls, v_target_first
      FROM jsonb_array_elements(v_filtered) elem;

    IF p_mode = 'append_only' THEN
      SELECT COALESCE(jsonb_agg(DISTINCT u), '[]'::jsonb)
        INTO v_merged_urls
        FROM (
          SELECT jsonb_array_elements_text(rec.rs_urls) AS u
          UNION
          SELECT jsonb_array_elements_text(v_target_urls) AS u
        ) s
        WHERE u IS NOT NULL AND u <> '';

      IF v_merged_urls = rec.rs_urls THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.review_submissions (kpi_id, self_evidence_url, self_evidence_urls, updated_at)
      VALUES (rec.kpi_id, COALESCE(rec.rs_first, v_target_first), v_merged_urls, now())
      ON CONFLICT (kpi_id) DO UPDATE SET
        self_evidence_url  = COALESCE(review_submissions.self_evidence_url, EXCLUDED.self_evidence_url),
        self_evidence_urls = EXCLUDED.self_evidence_urls,
        updated_at = now();

      v_pushed := v_pushed + 1;
      v_details := v_details || jsonb_build_object(
        'kpi_id', rec.kpi_id, 'employee_id', rec.employee_id, 'mode','append_only',
        'targeted_count', jsonb_array_length(v_target_urls)
      );

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_RESYNCED', v_user,
              jsonb_build_object('mode','append_only','okv_id', v_okv.id,
                                 'targeted_urls', v_target_urls));
    ELSE
      -- replace_with_stepback
      IF rec.kpi_status = ANY(v_locked_statuses) THEN
        UPDATE public.kpis SET status = 'self_review'::review_status WHERE id = rec.kpi_id;
        v_stepped_back := v_stepped_back + 1;

        INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
        VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_STEPBACK', v_user,
                jsonb_build_object('from_status', rec.kpi_status,'okv_id', v_okv.id,
                                   'reason','admin replaced org KPI supporting files'));
      END IF;

      INSERT INTO public.review_submissions (kpi_id, self_evidence_url, self_evidence_urls, updated_at)
      VALUES (rec.kpi_id, v_target_first, v_target_urls, now())
      ON CONFLICT (kpi_id) DO UPDATE SET
        self_evidence_url  = EXCLUDED.self_evidence_url,
        self_evidence_urls = EXCLUDED.self_evidence_urls,
        updated_at = now();

      v_pushed := v_pushed + 1;
      v_details := v_details || jsonb_build_object(
        'kpi_id', rec.kpi_id, 'employee_id', rec.employee_id, 'mode','replace_with_stepback',
        'targeted_count', jsonb_array_length(v_target_urls),
        'stepped_back', (rec.kpi_status = ANY(v_locked_statuses))
      );

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (rec.kpi_id, 'ORG_KPI_EVIDENCE_RESYNCED', v_user,
              jsonb_build_object('mode','replace_with_stepback','okv_id', v_okv.id,
                                 'targeted_urls', v_target_urls));
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

-- 4) Per-employee distribution preview: for a single OKV, what does each
--    mapped employee currently have vs what they SHOULD have?
CREATE OR REPLACE FUNCTION public.org_kpi_evidence_targeting(p_okv_id uuid)
RETURNS TABLE(
  employee_id uuid,
  employee_name text,
  department_id uuid,
  department_name text,
  kpi_id uuid,
  kpi_status text,
  expected_files jsonb,
  current_urls jsonb,
  drift_kind text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_okv record;
  v_authorized boolean := false;
  v_kra_norm text;
  v_kpi_norm text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_okv FROM public.org_kpi_values WHERE id = p_okv_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'org_kpi_values row not found: %', p_okv_id; END IF;

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
  IF NOT v_authorized THEN RAISE EXCEPTION 'Not authorized'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.employee_id,
           pf.full_name AS employee_name,
           pf.department_id,
           d.name AS department_name,
           COALESCE(rs.self_evidence_urls, '[]'::jsonb) AS rs_urls
      FROM public.kpis k
      LEFT JOIN public.profiles pf ON pf.id = k.employee_id
      LEFT JOIN public.departments d ON d.id = pf.department_id
      LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
     WHERE k.is_org_level = true
       AND k.category_id  = v_okv.category_id
       AND k.review_period = v_okv.review_period
       AND k.review_year   = v_okv.review_year
       AND normalize_kpi_text(k.kra_name) = v_kra_norm
       AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
       AND (v_okv.employee_id   IS NULL OR k.employee_id   = v_okv.employee_id)
       AND (v_okv.department_id IS NULL OR pf.department_id = v_okv.department_id)
  ),
  enriched AS (
    SELECT b.*,
           public._filter_files_for_employee(v_okv.evidence_files, b.employee_id, b.department_id) AS expected
      FROM base b
  ),
  projected AS (
    SELECT e.*,
           COALESCE((
             SELECT jsonb_agg(elem->>'url')
               FROM jsonb_array_elements(e.expected) elem
              WHERE elem->>'url' IS NOT NULL AND elem->>'url' <> ''
           ), '[]'::jsonb) AS expected_urls
      FROM enriched e
  )
  SELECT p.employee_id,
         COALESCE(p.employee_name, 'Employee ' || left(p.employee_id::text, 8)),
         p.department_id,
         COALESCE(p.department_name, '—'),
         p.kpi_id,
         p.kpi_status,
         p.expected,
         p.rs_urls,
         CASE
           WHEN p.expected_urls = p.rs_urls THEN 'in_sync'
           WHEN jsonb_array_length(p.rs_urls) = 0 THEN 'not_propagated'
           WHEN (SELECT count(*) FROM jsonb_array_elements_text(p.expected_urls) u
                 WHERE u NOT IN (SELECT jsonb_array_elements_text(p.rs_urls))) > 0
                AND (SELECT count(*) FROM jsonb_array_elements_text(p.rs_urls) u
                     WHERE u NOT IN (SELECT jsonb_array_elements_text(p.expected_urls))) = 0
                THEN 'missing_files'
           WHEN (SELECT count(*) FROM jsonb_array_elements_text(p.rs_urls) u
                 WHERE u NOT IN (SELECT jsonb_array_elements_text(p.expected_urls))) > 0
                AND (SELECT count(*) FROM jsonb_array_elements_text(p.expected_urls) u
                     WHERE u NOT IN (SELECT jsonb_array_elements_text(p.rs_urls))) = 0
                THEN 'extra_files'
           ELSE 'mismatch'
         END
    FROM projected p
   ORDER BY p.employee_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_kpi_evidence_targeting(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_kpi_evidence_targeting IS
  'Per-employee distribution preview for an Org KPI: returns each mapped employee with their EXPECTED files (after per-file targeting filter) vs CURRENT files on their review_submission row, plus a drift_kind.';

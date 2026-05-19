-- ============================================================
-- RCA 2026-05-19 — Admin Org KPI Data Entry header chips
-- (Supporting / Parity / Manage files) disappear for cards
-- whose mapped employees have no org_kpi_values rows yet.
-- The header is gated by `scopedOkvIds.length > 0`; without an
-- OKV row there's no id to anchor the file-management sheet.
--
-- This RPC lazily materialises one minimal OKV row per mapped
-- employee for a given (category, kra, kpi, period, year). Idempotent.
-- Also seeds evidence_urls from review_submissions.self_evidence_urls
-- when the OKV row is brand new (or pre-existing but empty), so the
-- admin sees the same supporting files the employee uploaded.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_org_kpi_scope_rows(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_created int := 0;
  v_evidence_seeded int := 0;
  v_already int := 0;
  v_emp record;
  v_okv_id uuid;
  v_was_new boolean;
  v_self_urls jsonb;
  v_self_url text;
  v_existing_urls jsonb;
  v_existing_url text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- AuthZ: admin OR assigned data owner for this KPI tuple.
  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to materialise org KPI scope rows';
  END IF;

  -- Iterate mapped employees (same join the diagnose RPC uses).
  FOR v_emp IN
    SELECT DISTINCT k.employee_id, p.department_id, k.id AS kpi_id
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
    WHERE k.is_org_level = true
      AND k.category_id = p_category_id
      AND k.review_period = p_review_period
      AND k.review_year = p_review_year
      AND normalize_kpi_text(k.kra_name) = v_kra_norm
      AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
      AND k.employee_id IS NOT NULL
  LOOP
    v_was_new := false;
    v_okv_id := NULL;

    -- Try to find an existing OKV row first (canonical: employee-scope row).
    SELECT v.id, v.evidence_urls, v.evidence_url
      INTO v_okv_id, v_existing_urls, v_existing_url
    FROM org_kpi_values v
    WHERE v.category_id = p_category_id
      AND normalize_kpi_text(v.kra_name) = v_kra_norm
      AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
      AND v.review_period = p_review_period
      AND v.review_year = p_review_year
      AND v.employee_id = v_emp.employee_id
    LIMIT 1;

    IF v_okv_id IS NULL THEN
      -- Insert minimal placeholder row. ON CONFLICT guards races
      -- (e.g. two admins opening the page concurrently).
      INSERT INTO org_kpi_values (
        category_id, kra_name, kpi_name,
        review_period, review_year,
        department_id, employee_id,
        achieved_value, is_na, status,
        entered_by
      )
      VALUES (
        p_category_id, p_kra_name, p_kpi_name,
        p_review_period, p_review_year,
        v_emp.department_id, v_emp.employee_id,
        NULL, false, 'entered',
        NULL
      )
      ON CONFLICT (
        category_id, kra_name, kpi_name, review_period, review_year,
        COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) DO NOTHING
      RETURNING id INTO v_okv_id;

      IF v_okv_id IS NOT NULL THEN
        v_created := v_created + 1;
        v_was_new := true;
        v_existing_urls := '[]'::jsonb;
        v_existing_url := NULL;
      ELSE
        -- Race: row was inserted by another tx. Re-read it.
        SELECT v.id, v.evidence_urls, v.evidence_url
          INTO v_okv_id, v_existing_urls, v_existing_url
        FROM org_kpi_values v
        WHERE v.category_id = p_category_id
          AND normalize_kpi_text(v.kra_name) = v_kra_norm
          AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
          AND v.review_period = p_review_period
          AND v.review_year = p_review_year
          AND v.employee_id = v_emp.employee_id
        LIMIT 1;
        v_already := v_already + 1;
      END IF;
    ELSE
      v_already := v_already + 1;
    END IF;

    -- Evidence seed: only when OKV row has no evidence yet AND a
    -- review_submissions row carries self-uploaded files.
    IF v_okv_id IS NOT NULL
       AND (v_existing_url IS NULL)
       AND (v_existing_urls IS NULL OR jsonb_array_length(COALESCE(v_existing_urls, '[]'::jsonb)) = 0) THEN
      SELECT rs.self_evidence_urls, rs.self_evidence_url
        INTO v_self_urls, v_self_url
      FROM review_submissions rs
      WHERE rs.kpi_id = v_emp.kpi_id
      LIMIT 1;

      IF (v_self_urls IS NOT NULL AND jsonb_array_length(COALESCE(v_self_urls, '[]'::jsonb)) > 0)
         OR (v_self_url IS NOT NULL AND length(trim(v_self_url)) > 0) THEN
        UPDATE org_kpi_values
        SET evidence_urls = CASE
              WHEN v_self_urls IS NOT NULL AND jsonb_array_length(COALESCE(v_self_urls, '[]'::jsonb)) > 0
                THEN v_self_urls
              ELSE jsonb_build_array(v_self_url)
            END
        WHERE id = v_okv_id;
        v_evidence_seeded := v_evidence_seeded + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'evidence_seeded', v_evidence_seeded,
    'already_existed', v_already
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_org_kpi_scope_rows(uuid, text, text, text, integer) TO authenticated;
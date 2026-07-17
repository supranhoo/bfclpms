-- =========================================================================
-- CAPA-2026-07 v3 / ADR-106 — Self value snapshot contract hardening
-- =========================================================================
-- Root cause: the previous trigger version exempted UPDATEs that also touched
-- any reviewer-stage *_achieved_value column, so historical rows whose reviewer
-- stages were populated *before* the snapshot column existed never got mirrored
-- and continued to render "Value: —" under the Self card.
--
-- This migration:
--   1. Replaces enforce_self_snapshot_mirror() with a stricter rule that also
--      fires when achieved_value itself is unchanged, as long as
--      self_achieved_value is still NULL and no reviewer column was touched
--      in the same UPDATE.
--   2. Runs a one-time reverse-derivation backfill for rows still holding
--      self_achieved_value = NULL.
--   3. Extends repair_org_kpi_late_self_backfill and
--      repair_org_kpi_entered_unpropagated_rows to co-write self_achieved_value.
-- =========================================================================

-- 1) Tighten trigger --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_self_snapshot_mirror()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_stage_touched boolean;
BEGIN
  -- Nothing to mirror if snapshot already populated or no source value.
  IF NEW.self_achieved_value IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.achieved_value IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only mirror once the employee actually has a self score recorded.
  IF NEW.self_score IS NULL THEN
    RETURN NEW;
  END IF;

  -- If a reviewer stage was written in THIS update, achieved_value now holds
  -- the reviewer's number, not the self number — don't mirror.
  reviewer_stage_touched :=
       (NEW.manager_achieved_value    IS DISTINCT FROM OLD.manager_achieved_value)
    OR (NEW.skip_level_achieved_value IS DISTINCT FROM OLD.skip_level_achieved_value)
    OR (NEW.hr_pms_achieved_value     IS DISTINCT FROM OLD.hr_pms_achieved_value)
    OR (NEW.auditor_achieved_value    IS DISTINCT FROM OLD.auditor_achieved_value)
    OR (NEW.management_achieved_value IS DISTINCT FROM OLD.management_achieved_value);

  IF reviewer_stage_touched THEN
    RETURN NEW;
  END IF;

  NEW.self_achieved_value := NEW.achieved_value;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_self_snapshot_mirror() IS
'CAPA-2026-07 v3 — Mirrors achieved_value onto self_achieved_value on any self-owning UPDATE (even value-preserving) as long as the snapshot is still NULL. Exempts UPDATEs that also modify a reviewer-stage *_achieved_value column.';

-- Trigger already exists; recreate to ensure it points at the new body.
DROP TRIGGER IF EXISTS trg_enforce_self_snapshot_mirror ON public.review_submissions;
CREATE TRIGGER trg_enforce_self_snapshot_mirror
BEFORE UPDATE ON public.review_submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_self_snapshot_mirror();

-- 2) Reverse-derivation helper --------------------------------------------
CREATE OR REPLACE FUNCTION public._derive_self_value_from_score(
  p_self_score numeric,
  p_criteria text,
  p_uom_type text,
  p_target numeric,
  p_r5 text, p_r4 text, p_r3 text, p_r2 text, p_r1 text, p_r0 text
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  higher_better boolean := COALESCE(p_criteria, 'Higher is Better')
                             NOT IN ('Lower is Better','Lower the Better');
  candidates numeric[] := ARRAY[]::numeric[];
  c numeric;
  n numeric;
  score numeric;
  match_val numeric := NULL;
  match_count int := 0;
  raw text;
BEGIN
  IF p_self_score IS NULL THEN RETURN NULL; END IF;

  -- Binary / tiered → self value IS the score.
  IF p_uom_type IN ('binary','tiered') THEN
    RETURN p_self_score;
  END IF;

  FOREACH raw IN ARRAY ARRAY[p_r0,p_r1,p_r2,p_r3,p_r4,p_r5]
  LOOP
    BEGIN
      n := NULLIF(raw,'')::numeric;
      IF n IS NOT NULL THEN candidates := candidates || n; END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  FOREACH c IN ARRAY candidates
  LOOP
    BEGIN
      IF higher_better THEN
        score := CASE
          WHEN c >= NULLIF(p_r5,'')::numeric THEN 5
          WHEN c >= NULLIF(p_r4,'')::numeric THEN 4
          WHEN c >= NULLIF(p_r3,'')::numeric THEN 3
          WHEN c >= NULLIF(p_r2,'')::numeric THEN 2
          WHEN c >= NULLIF(p_r1,'')::numeric THEN 1
          ELSE 0 END;
      ELSE
        score := CASE
          WHEN c <= NULLIF(p_r5,'')::numeric THEN 5
          WHEN c <= NULLIF(p_r4,'')::numeric THEN 4
          WHEN c <= NULLIF(p_r3,'')::numeric THEN 3
          WHEN c <= NULLIF(p_r2,'')::numeric THEN 2
          WHEN c <= NULLIF(p_r1,'')::numeric THEN 1
          ELSE 0 END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF score = p_self_score THEN
      IF match_val IS NULL THEN
        match_val := c;
        match_count := 1;
      ELSIF match_val IS DISTINCT FROM c THEN
        match_count := match_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF match_count = 1 THEN
    RETURN match_val;
  END IF;
  RETURN NULL; -- ambiguous / unrecoverable
END;
$$;

-- 3) One-time backfill v2 --------------------------------------------------
DO $$
DECLARE
  v_updated int := 0;
BEGIN
  SET LOCAL session_replication_role = replica; -- skip triggers during bulk

  WITH cand AS (
    SELECT rs.id AS rs_id, rs.kpi_id, rs.self_score, rs.achieved_value,
           k.criteria, k.uom_type::text AS uom_type, k.target_value,
           k.r5, k.r4, k.r3, k.r2, k.r1, k.r0
    FROM public.review_submissions rs
    JOIN public.kpis k ON k.id = rs.kpi_id
    WHERE rs.self_achieved_value IS NULL
      AND rs.self_score IS NOT NULL
  ),
  derived AS (
    SELECT rs_id, kpi_id, self_score, achieved_value,
           public._derive_self_value_from_score(
             self_score, criteria, uom_type, target_value,
             r5, r4, r3, r2, r1, r0
           ) AS derived_val
    FROM cand
  ),
  upd AS (
    UPDATE public.review_submissions rs
       SET self_achieved_value = d.derived_val,
           updated_at = now()
      FROM derived d
     WHERE rs.id = d.rs_id
       AND d.derived_val IS NOT NULL
    RETURNING rs.id, rs.kpi_id, d.derived_val, d.self_score, d.achieved_value
  ),
  audit_ins AS (
    INSERT INTO public.kpi_audit_logs (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata)
    SELECT upd.kpi_id, upd.id, 'SELF_SNAPSHOT_BACKFILL_V2', NULL,
           jsonb_build_object('self_achieved_value', NULL, 'achieved_value', upd.achieved_value),
           jsonb_build_object('self_achieved_value', upd.derived_val, 'self_score', upd.self_score),
           jsonb_build_object(
             'source','SELF_SNAPSHOT_BACKFILL_V2',
             'method','reverse_derivation_from_thresholds',
             'reason','Historical row had NULL self_achieved_value; reverse-derived from frozen self_score + KPI thresholds.'
           )
    FROM upd
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  RAISE NOTICE 'SELF_SNAPSHOT_BACKFILL_V2: % rows updated', v_updated;
END $$;

-- 4) Repair RPCs — co-write self_achieved_value -----------------------------
CREATE OR REPLACE FUNCTION public.repair_org_kpi_late_self_backfill(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_review_period text, p_review_year integer, p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  rec record;
  v_repaired int := 0; v_skipped int := 0; v_candidates int := 0;
  v_self_score numeric; v_self_rating text; v_higher_better boolean;
  v_repaired_employees jsonb := '[]'::jsonb;
  v_batch_id uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins may run late self backfill';
  END IF;

  FOR rec IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.target_value, k.criteria,
      k.uom_type::text AS uom_type, k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
      v.id AS okv_id, v.achieved_value AS okv_achieved, v.is_na AS okv_is_na,
      v.remarks AS okv_remarks,
      rs.id AS rs_id, rs.self_score AS rs_self_score, rs.manager_score AS rs_manager_score,
      rs.self_remarks AS rs_self_remarks,
      p.full_name, p.employee_code
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
    JOIN org_kpi_values v
      ON v.category_id = k.category_id AND v.employee_id = k.employee_id
     AND v.review_period = k.review_period AND v.review_year = k.review_year
     AND normalize_kpi_text(v.kra_name) = v_kra_norm
     AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
    JOIN review_submissions rs ON rs.kpi_id = k.id
    WHERE k.is_org_level = true AND k.category_id = p_category_id
      AND k.review_period = p_review_period AND k.review_year = p_review_year
      AND normalize_kpi_text(k.kra_name) = v_kra_norm
      AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
      AND rs.self_score IS NULL
      AND v.achieved_value IS NOT NULL
      AND k.status::text = 'manager_check'
  LOOP
    v_candidates := v_candidates + 1;

    IF COALESCE(rec.okv_is_na, false) THEN
      v_self_score := NULL;
    ELSIF rec.uom_type = 'binary' OR rec.uom_type = 'tiered' THEN
      v_self_score := rec.okv_achieved;
    ELSE
      v_higher_better := COALESCE(rec.criteria, 'Higher is Better') NOT IN ('Lower is Better', 'Lower the Better');
      BEGIN
        IF v_higher_better THEN
          v_self_score := CASE
            WHEN rec.okv_achieved >= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved >= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved >= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved >= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved >= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        ELSE
          v_self_score := CASE
            WHEN rec.okv_achieved <= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved <= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved <= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved <= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved <= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_self_score := 0;
      END;
    END IF;

    v_self_rating := CASE
      WHEN v_self_score IS NULL THEN NULL
      WHEN v_self_score >= 4 THEN 'green'
      WHEN v_self_score >= 3 THEN 'yellow'
      ELSE 'red' END;

    IF p_dry_run THEN
      v_repaired_employees := v_repaired_employees || jsonb_build_object(
        'employee_code', rec.employee_code, 'full_name', rec.full_name,
        'okv_achieved', rec.okv_achieved, 'derived_self_score', v_self_score,
        'manager_score', rec.rs_manager_score
      );
      CONTINUE;
    END IF;

    UPDATE review_submissions
      SET achieved_value      = COALESCE(achieved_value, rec.okv_achieved),
          self_achieved_value = COALESCE(self_achieved_value, rec.okv_achieved),
          self_score          = v_self_score,
          self_rating         = v_self_rating::rating_level,
          self_remarks        = COALESCE(rs_self_remarks, rec.okv_remarks),
          updated_at          = now()
      WHERE id = rec.rs_id;

    UPDATE org_kpi_values SET status = 'propagated', updated_at = now() WHERE id = rec.okv_id;

    INSERT INTO kpi_audit_logs (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      rec.kpi_id, rec.rs_id, 'late_self_backfill', v_user,
      jsonb_build_object('self_score', null, 'achieved_value', null),
      jsonb_build_object('self_score', v_self_score, 'self_rating', v_self_rating, 'achieved_value', rec.okv_achieved, 'self_achieved_value', rec.okv_achieved),
      jsonb_build_object('batch_id', v_batch_id, 'source', 'repair_org_kpi_late_self_backfill', 'okv_id', rec.okv_id)
    );

    v_repaired := v_repaired + 1;
    v_repaired_employees := v_repaired_employees || jsonb_build_object(
      'employee_code', rec.employee_code, 'full_name', rec.full_name,
      'okv_achieved', rec.okv_achieved, 'derived_self_score', v_self_score
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run, 'batch_id', v_batch_id,
    'candidates', v_candidates, 'repaired', v_repaired,
    'skipped', v_skipped, 'employees', v_repaired_employees
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_org_kpi_entered_unpropagated_rows(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_review_period text, p_review_year integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_locked_statuses text[] := ARRAY['manager_check','audit','skip_level_check','hr_pms_review','management_review','approved'];
  rec record;
  v_repaired int := 0; v_locked int := 0; v_blank int := 0; v_missing int := 0; v_already int := 0;
  v_self_score numeric; v_self_rating text; v_higher_better boolean;
  v_repaired_employees jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id=v_user AND o.category_id=p_category_id
        AND normalize_kpi_text(o.kra_name)=v_kra_norm
        AND normalize_kpi_text(o.kpi_name)=v_kpi_norm) INTO v_authorized;
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'Not authorized to repair this org KPI'; END IF;

  FOR rec IN
    SELECT k.id AS kpi_id, k.status::text AS kpi_status, k.target_value, k.criteria,
      k.uom_type::text AS uom_type, k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
      v.id AS okv_id, v.achieved_value AS okv_achieved, v.is_na AS okv_is_na,
      v.remarks AS okv_remarks, v.evidence_url AS okv_evidence, v.evidence_urls AS okv_evidence_urls,
      rs.kpi_id IS NOT NULL AS has_rs, rs.self_score AS rs_self_score, p.full_name
    FROM kpis k
    LEFT JOIN profiles p ON p.id=k.employee_id
    LEFT JOIN org_kpi_values v
      ON v.category_id=k.category_id AND v.employee_id=k.employee_id
     AND v.review_period=k.review_period AND v.review_year=k.review_year
     AND normalize_kpi_text(v.kra_name)=v_kra_norm
     AND normalize_kpi_text(v.kpi_name)=v_kpi_norm
    LEFT JOIN review_submissions rs ON rs.kpi_id=k.id
    WHERE k.is_org_level=true AND k.category_id=p_category_id
      AND k.review_period=p_review_period AND k.review_year=p_review_year
      AND normalize_kpi_text(k.kra_name)=v_kra_norm
      AND normalize_kpi_text(k.kpi_name)=v_kpi_norm
  LOOP
    IF rec.has_rs AND rec.rs_self_score IS NOT NULL THEN v_already:=v_already+1; CONTINUE; END IF;
    IF rec.okv_id IS NULL THEN v_missing:=v_missing+1; CONTINUE; END IF;
    IF rec.okv_achieved IS NULL AND COALESCE(rec.okv_is_na,false)=false THEN v_blank:=v_blank+1; CONTINUE; END IF;
    IF rec.kpi_status = ANY(v_locked_statuses) THEN v_locked:=v_locked+1; CONTINUE; END IF;

    IF COALESCE(rec.okv_is_na,false) THEN
      v_self_score := NULL;
    ELSIF rec.uom_type = 'binary' OR rec.uom_type = 'tiered' THEN
      v_self_score := rec.okv_achieved;
    ELSE
      v_higher_better := COALESCE(rec.criteria,'Higher is Better') NOT IN ('Lower is Better','Lower the Better');
      BEGIN
        IF v_higher_better THEN
          v_self_score := CASE
            WHEN rec.okv_achieved >= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved >= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved >= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved >= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved >= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        ELSE
          v_self_score := CASE
            WHEN rec.okv_achieved <= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved <= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved <= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved <= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved <= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0 END;
        END IF;
      EXCEPTION WHEN OTHERS THEN v_self_score := 0;
      END;
    END IF;

    v_self_rating := CASE
      WHEN v_self_score IS NULL THEN NULL
      WHEN v_self_score >= 4 THEN 'green'
      WHEN v_self_score >= 3 THEN 'yellow'
      ELSE 'red' END;

    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    ) VALUES (
      rec.kpi_id,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_achieved END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_achieved END,
      v_self_score,
      CASE WHEN rec.okv_is_na THEN NULL ELSE v_self_rating::rating_level END,
      COALESCE(rec.okv_is_na,false),
      CASE WHEN rec.okv_is_na THEN 'admin' ELSE NULL END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_evidence END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_evidence_urls END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_remarks END,
      now()
    ) ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value      = EXCLUDED.achieved_value,
      self_achieved_value = COALESCE(review_submissions.self_achieved_value, EXCLUDED.self_achieved_value),
      self_score          = EXCLUDED.self_score,
      self_rating         = EXCLUDED.self_rating,
      is_na               = EXCLUDED.is_na,
      na_marked_by_role   = EXCLUDED.na_marked_by_role,
      self_evidence_url   = COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls  = COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks        = COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at          = now();

    UPDATE kpis SET status='self_review'::review_status WHERE id=rec.kpi_id AND status='kra_set';
    UPDATE org_kpi_values SET status='propagated', updated_at=now() WHERE id=rec.okv_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, new_value, metadata)
    VALUES (rec.kpi_id, 'ORG_KPI_PROPAGATED', v_user,
      jsonb_build_object('achieved_value',rec.okv_achieved,'self_achieved_value',rec.okv_achieved,'self_score',v_self_score,
        'self_rating',v_self_rating,'is_na',COALESCE(rec.okv_is_na,false),
        'source','repair_org_kpi_entered_unpropagated_rows'),
      jsonb_build_object('repaired_from_status',rec.kpi_status));

    v_repaired := v_repaired + 1;
    v_repaired_employees := v_repaired_employees || jsonb_build_object(
      'kpi_id',rec.kpi_id,'employee_name',rec.full_name,'self_score',v_self_score);
  END LOOP;

  RETURN jsonb_build_object('repaired',v_repaired,'reviewer_locked',v_locked,
    'staging_blank',v_blank,'missing_staging',v_missing,'already_propagated',v_already,
    'repaired_employees',v_repaired_employees);
END;
$function$;

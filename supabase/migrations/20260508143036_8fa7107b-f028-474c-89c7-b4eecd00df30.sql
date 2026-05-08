
CREATE OR REPLACE FUNCTION public.repair_org_kpi_entered_unpropagated_rows(
  p_category_id uuid, p_kra_name text, p_kpi_name text,
  p_review_period text, p_review_year integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

    -- rating_level enum is (red, yellow, green, blue) — no orange.
    v_self_rating := CASE
      WHEN v_self_score IS NULL THEN NULL
      WHEN v_self_score >= 4 THEN 'green'
      WHEN v_self_score >= 3 THEN 'yellow'
      ELSE 'red' END;

    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    ) VALUES (
      rec.kpi_id,
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
      achieved_value=EXCLUDED.achieved_value, self_score=EXCLUDED.self_score,
      self_rating=EXCLUDED.self_rating, is_na=EXCLUDED.is_na,
      na_marked_by_role=EXCLUDED.na_marked_by_role,
      self_evidence_url=COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls=COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks=COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at=now();

    UPDATE kpis SET status='self_review'::review_status WHERE id=rec.kpi_id AND status='kra_set';
    UPDATE org_kpi_values SET status='propagated', updated_at=now() WHERE id=rec.okv_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, new_value, metadata)
    VALUES (rec.kpi_id, 'ORG_KPI_PROPAGATED', v_user,
      jsonb_build_object('achieved_value',rec.okv_achieved,'self_score',v_self_score,
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

GRANT EXECUTE ON FUNCTION public.repair_org_kpi_entered_unpropagated_rows(uuid, text, text, text, integer) TO authenticated;

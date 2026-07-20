
-- ADR-123 — One-shot FAD backfill for Annual Production (98%) and Annual PM (100%).
DO $$
DECLARE
  v_prod_raw numeric := 98;
  v_pm_raw   numeric := 100;
  v_updated  int := 0;
  v_skipped_no_slot int := 0;
  v_skipped_same    int := 0;
  r record;
  v_prod_slot jsonb;
  v_pm_slot   jsonb;
  v_prod_id   text;
  v_pm_id     text;
  v_prod_w    numeric;
  v_pm_w      numeric;
  v_prod_rating int;
  v_pm_rating   int;
  v_prod_pts    numeric;
  v_pm_pts      numeric;
  v_new_raw   jsonb;
  v_new_pts   jsonb;
  v_prev_raw  jsonb;
  v_prev_pts  jsonb;
BEGIN
  FOR r IN
    SELECT i.id, i.system_scores_raw, i.system_scores, i.overall_status,
           coalesce(i.template_override_id, i.template_id) AS tid,
           p.employee_code, p.full_name, d.name AS dept
    FROM annual_review_instances i
    JOIN profiles p ON p.id = i.employee_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE d.name ILIKE 'FAD-%'
      AND i.overall_status IN (
        'not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu','pending_hr'
      )
  LOOP
    SELECT sl INTO v_prod_slot
    FROM annual_review_templates t, jsonb_array_elements(t.sections->'system_scores') sl
    WHERE t.id = r.tid AND sl->>'library_key' = 'annual_production'
    LIMIT 1;

    SELECT sl INTO v_pm_slot
    FROM annual_review_templates t, jsonb_array_elements(t.sections->'system_scores') sl
    WHERE t.id = r.tid AND sl->>'library_key' = 'annual_pm'
    LIMIT 1;

    IF v_prod_slot IS NULL OR v_pm_slot IS NULL THEN
      v_skipped_no_slot := v_skipped_no_slot + 1;
      CONTINUE;
    END IF;

    v_prod_id := v_prod_slot->>'id';
    v_pm_id   := v_pm_slot->>'id';
    v_prod_w  := COALESCE((v_prod_slot->>'weight')::numeric, 0);
    v_pm_w    := COALESCE((v_pm_slot->>'weight')::numeric, 0);

    v_prod_rating := CASE
      WHEN v_prod_raw >= 100 THEN 5
      WHEN v_prod_raw >= 95  THEN 4
      WHEN v_prod_raw >= 90  THEN 3
      WHEN v_prod_raw >= 85  THEN 2
      WHEN v_prod_raw >= 80  THEN 1
      ELSE 0
    END;
    v_pm_rating := CASE
      WHEN v_pm_raw >= 100 THEN 5
      WHEN v_pm_raw >= 95  THEN 4
      WHEN v_pm_raw >= 90  THEN 3
      WHEN v_pm_raw >= 85  THEN 2
      WHEN v_pm_raw >= 80  THEN 1
      ELSE 0
    END;

    v_prod_pts := (v_prod_rating::numeric / 5) * v_prod_w;
    v_pm_pts   := (v_pm_rating::numeric   / 5) * v_pm_w;

    v_prev_raw := COALESCE(r.system_scores_raw, '{}'::jsonb);
    v_prev_pts := COALESCE(r.system_scores,     '{}'::jsonb);

    IF (v_prev_raw->>v_prod_id)::numeric IS NOT DISTINCT FROM v_prod_raw
       AND (v_prev_raw->>v_pm_id)::numeric IS NOT DISTINCT FROM v_pm_raw THEN
      v_skipped_same := v_skipped_same + 1;
      CONTINUE;
    END IF;

    v_new_raw := v_prev_raw
      || jsonb_build_object(v_prod_id, v_prod_raw)
      || jsonb_build_object(v_pm_id,   v_pm_raw);

    v_new_pts := v_prev_pts
      || jsonb_build_object(v_prod_id, v_prod_pts)
      || jsonb_build_object(v_pm_id,   v_pm_pts);

    UPDATE annual_review_instances
       SET system_scores_raw = v_new_raw,
           system_scores     = v_new_pts,
           updated_at        = now()
     WHERE id = r.id;

    INSERT INTO system_audit_logs (action, performed_by, metadata)
    VALUES (
      'annual_review.system_score_backfill',
      NULL,
      jsonb_build_object(
        'policy',        'ADR-123',
        'reason',        'FAD dept one-shot backfill: production 98%, PM 100%',
        'instance_id',   r.id,
        'employee_code', r.employee_code,
        'employee_name', r.full_name,
        'department',    r.dept,
        'template_id',   r.tid,
        'status',        r.overall_status,
        'slots', jsonb_build_object(
          v_prod_id, jsonb_build_object('library_key','annual_production','raw',v_prod_raw,'rating',v_prod_rating,'points',v_prod_pts,'weight',v_prod_w,'prev_raw',v_prev_raw->v_prod_id),
          v_pm_id,   jsonb_build_object('library_key','annual_pm',        'raw',v_pm_raw,  'rating',v_pm_rating,  'points',v_pm_pts,  'weight',v_pm_w,  'prev_raw',v_prev_raw->v_pm_id)
        )
      )
    );

    v_updated := v_updated + 1;
  END LOOP;

  RAISE NOTICE 'ADR-123 FAD backfill: updated=% skipped_no_slot=% skipped_same=%',
    v_updated, v_skipped_no_slot, v_skipped_same;
END $$;

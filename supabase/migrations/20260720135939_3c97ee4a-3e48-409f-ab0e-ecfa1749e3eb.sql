
DO $mig$
DECLARE
  r RECORD;
  eff_template uuid;
  sys_items jsonb;
  prod_id text;
  pm_id text;
  prod_weight numeric;
  pm_weight numeric;
  new_scores jsonb;
  new_raw jsonb;
  touched_prod int := 0;
  touched_pm int := 0;
  skipped int := 0;
  summary_details jsonb := '[]'::jsonb;
  computed RECORD;
BEGIN
  FOR r IN
    SELECT ai.id, ai.template_id, ai.template_override_id,
           ai.system_scores, ai.system_scores_raw,
           ai.overall_status, ai.criteria_weighted_score,
           d.name AS dept_name, p.employee_code
    FROM public.annual_review_instances ai
    JOIN public.profiles p ON p.id = ai.employee_id
    JOIN public.departments d ON d.id = p.department_id
    WHERE d.name ILIKE 'CLU%'
  LOOP
    eff_template := COALESCE(r.template_override_id, r.template_id);

    SELECT sections->'system_scores' INTO sys_items
    FROM public.annual_review_templates WHERE id = eff_template;

    IF sys_items IS NULL OR jsonb_typeof(sys_items) <> 'array' THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    SELECT elem->>'id', (elem->>'weight')::numeric
      INTO prod_id, prod_weight
    FROM jsonb_array_elements(sys_items) elem
    WHERE elem->>'library_key' = 'annual_production'
    LIMIT 1;

    SELECT elem->>'id', (elem->>'weight')::numeric
      INTO pm_id, pm_weight
    FROM jsonb_array_elements(sys_items) elem
    WHERE elem->>'library_key' = 'annual_pm'
    LIMIT 1;

    IF prod_id IS NULL AND pm_id IS NULL THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.system_audit_logs (action, performed_by, metadata)
    VALUES (
      'annual_review.system_score_backfill',
      NULL,
      jsonb_build_object(
        'category', 'CLU_ANNUAL_PROD_PM_V1',
        'instance_id', r.id,
        'employee_code', r.employee_code,
        'department', r.dept_name,
        'effective_template_id', eff_template,
        'prev_system_scores', COALESCE(r.system_scores, '{}'::jsonb),
        'prev_system_scores_raw', COALESCE(r.system_scores_raw, '{}'::jsonb),
        'prod_slot_id', prod_id,
        'pm_slot_id', pm_id
      )
    );

    new_scores := COALESCE(r.system_scores, '{}'::jsonb);
    new_raw := COALESCE(r.system_scores_raw, '{}'::jsonb);

    IF prod_id IS NOT NULL THEN
      new_scores := jsonb_set(new_scores, ARRAY[prod_id], to_jsonb(prod_weight), true);
      new_raw := jsonb_set(new_raw, ARRAY[prod_id], to_jsonb(104::numeric), true);
      touched_prod := touched_prod + 1;
    END IF;

    IF pm_id IS NOT NULL THEN
      new_scores := jsonb_set(new_scores, ARRAY[pm_id], to_jsonb(pm_weight), true);
      new_raw := jsonb_set(new_raw, ARRAY[pm_id], to_jsonb(100::numeric), true);
      touched_pm := touched_pm + 1;
    END IF;

    UPDATE public.annual_review_instances
       SET system_scores = new_scores,
           system_scores_raw = new_raw,
           updated_at = now()
     WHERE id = r.id;

    IF r.overall_status::text IN ('completed','pending_dept','pending_bu')
       AND r.criteria_weighted_score IS NOT NULL THEN
      SELECT * INTO computed
      FROM public.annual_review_compute_final_summary(r.id);
      IF computed.total_score IS NOT NULL THEN
        UPDATE public.annual_review_instances
           SET total_score = computed.total_score,
               final_rating = computed.final_rating,
               criteria_weighted_score = COALESCE(criteria_weighted_score, computed.criteria_weighted_score),
               updated_at = now()
         WHERE id = r.id;
      END IF;
    END IF;

    summary_details := summary_details || jsonb_build_object(
      'instance_id', r.id,
      'employee_code', r.employee_code,
      'department', r.dept_name,
      'prod_applied', prod_id IS NOT NULL,
      'pm_applied', pm_id IS NOT NULL
    );
  END LOOP;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.clu_prod_pm_backfill_summary',
    NULL,
    jsonb_build_object(
      'category', 'CLU_ANNUAL_PROD_PM_V1',
      'adr', 'ADR-125',
      'policy', 'AR-CLU-ANNUAL-PROD-PM-BACKFILL',
      'production_percent', 104,
      'pm_percent', 100,
      'production_applied_count', touched_prod,
      'pm_applied_count', touched_pm,
      'skipped_instance_count', skipped,
      'details', summary_details
    )
  );

  RAISE NOTICE 'CLU backfill complete: production=%, pm=%, skipped=%',
    touched_prod, touched_pm, skipped;
END
$mig$;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (SELECT reporting_manager_id FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM reporting_manager_id
  AND (SELECT department_id FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM department_id
  AND (SELECT pms_grade FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM pms_grade
  AND (SELECT employment_status FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM employment_status
  AND (SELECT is_active FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM is_active
  AND (SELECT portal_access FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM portal_access
  AND (SELECT confirmation_increment_granted FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM confirmation_increment_granted
  AND (SELECT company_id FROM public.profiles WHERE id = auth.uid()) IS NOT DISTINCT FROM company_id
);

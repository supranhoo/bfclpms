CREATE OR REPLACE FUNCTION public.bulk_exempt_eligibility_criterion(p_cycle_id uuid, p_criterion_id text, p_operator text, p_threshold text, p_only_sole_failure boolean DEFAULT true, p_reason text DEFAULT NULL::text, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(instance_id uuid, employee_id uuid, criterion_name text, actual text, action text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_matched integer := 0;
  v_applied integer := 0;
  r record;
  c jsonb;
  v_actual jsonb;
  v_fail_total integer;
  v_target_fail boolean;
  v_target_name text;
  v_target_actual text;
  v_within boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.ar_can_approve_eligibility_exemption(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to run bulk eligibility exemptions';
  END IF;
  IF coalesce(trim(p_reason), '') = '' AND NOT p_dry_run THEN
    RAISE EXCEPTION 'A reason is required for a bulk exemption';
  END IF;

  IF NOT p_dry_run THEN
    INSERT INTO public.annual_review_bulk_exemption_runs
      (cycle_id, criterion_key, operator, threshold, only_sole_failure, reason, performed_by)
    VALUES (p_cycle_id, p_criterion_id, coalesce(p_operator,'lte'), p_threshold,
            coalesce(p_only_sole_failure,true), p_reason, v_uid)
    RETURNING id INTO v_run_id;
  END IF;

  FOR r IN
    SELECT i.id, i.employee_id, i.eligibility_inputs,
           coalesce(t.sections->'eligibility_criteria','[]'::jsonb) AS criteria
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t
        ON t.id = coalesce(i.template_override_id, i.template_id)
     WHERE i.cycle_id = p_cycle_id
  LOOP
    v_fail_total := 0; v_target_fail := false;
    v_target_name := NULL; v_target_actual := NULL; v_within := false;

    FOR c IN SELECT * FROM jsonb_array_elements(r.criteria)
    LOOP
      v_actual := coalesce(
        r.eligibility_inputs -> (c->>'id'),
        r.eligibility_inputs -> (c->>'name')
      );
      IF public.ar_eligibility_evaluate(c->>'operator', c->>'type', v_actual, c->'expected_value') THEN
        CONTINUE;
      END IF;
      v_fail_total := v_fail_total + 1;
      IF (c->>'id') = p_criterion_id THEN
        v_target_fail := true;
        v_target_name := c->>'name';
        v_target_actual := v_actual #>> '{}';
        v_within := public.ar_eligibility_evaluate(
          coalesce(p_operator,'lte'), c->>'type', v_actual, to_jsonb(p_threshold));
      END IF;
    END LOOP;

    CONTINUE WHEN NOT v_target_fail;
    IF NOT v_within THEN CONTINUE; END IF;
    IF coalesce(p_only_sole_failure,true) AND v_fail_total > 1 THEN CONTINUE; END IF;

    IF NOT public.ar_eligibility_is_exemptable(v_target_name) THEN
      RAISE EXCEPTION 'Criterion "%" is not exemptable under the eligibility exemption policy', v_target_name;
    END IF;

    v_matched := v_matched + 1;
    instance_id := r.id; employee_id := r.employee_id;
    criterion_name := v_target_name; actual := v_target_actual;

    IF p_dry_run THEN
      action := 'match'; message := NULL;
    ELSE
      INSERT INTO public.annual_review_eligibility_exemptions
        (instance_id, cycle_id, employee_id, criterion_id, criterion_name, reason,
         requested_by, status, decided_by, decided_at, source, bulk_run_id)
      VALUES (r.id, p_cycle_id, r.employee_id, p_criterion_id, v_target_name, p_reason,
              NULL, 'approved', v_uid, now(), 'bulk', v_run_id)
      ON CONFLICT ON CONSTRAINT ar_elig_exemption_unique DO UPDATE
        SET status = 'approved', reason = EXCLUDED.reason,
            decided_by = EXCLUDED.decided_by, decided_at = now(),
            source = 'bulk', bulk_run_id = EXCLUDED.bulk_run_id, updated_at = now();
      v_applied := v_applied + 1;
      action := 'exempted'; message := NULL;
    END IF;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.annual_review_bulk_exemption_runs
       SET matched_count = v_matched, applied_count = v_applied, updated_at = now()
     WHERE id = v_run_id;
  END IF;
END;
$function$;
-- ADR-175 — June 2026 "Control dust emission" binary -> numeric 6-band rescale
-- Snapshot table (rollback source of truth)
CREATE TABLE IF NOT EXISTS public.kpi_dust_emission_rescale_2026_06 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL,
  submission_id uuid,
  employee_id uuid,
  old_uom_type text,
  old_threshold_mode text,
  old_r5 text, old_r4 text, old_r3 text, old_r2 text, old_r1 text, old_r0 text,
  old_criteria text,
  old_qualitative_options jsonb,
  old_submission jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid,
  note text
);

GRANT SELECT ON public.kpi_dust_emission_rescale_2026_06 TO authenticated;
GRANT ALL ON public.kpi_dust_emission_rescale_2026_06 TO service_role;

ALTER TABLE public.kpi_dust_emission_rescale_2026_06 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dust_rescale_admin_read" ON public.kpi_dust_emission_rescale_2026_06;
CREATE POLICY "dust_rescale_admin_read"
  ON public.kpi_dust_emission_rescale_2026_06
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.kpi_dust_emission_rescale_2026_06 IS
  'ADR-175 rollback snapshot for the June 2026 Control dust emission KPI rescale.';

-- Absolute 6-band evaluation for "number of cases" (lower is better)
CREATE OR REPLACE FUNCTION public.dust_cases_to_rating(p_cases numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_cases IS NULL THEN NULL
    WHEN p_cases <= 0 THEN 5
    WHEN p_cases <= 1 THEN 4
    WHEN p_cases <= 2 THEN 3
    WHEN p_cases <= 3 THEN 2
    WHEN p_cases <= 4 THEN 1
    ELSE 0
  END::numeric
$$;

CREATE OR REPLACE FUNCTION public.dust_rating_to_level(p_rating numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_rating IS NULL THEN NULL
    WHEN p_rating >= 5 THEN 'blue'
    WHEN p_rating >= 4 THEN 'green'
    WHEN p_rating >= 3 THEN 'yellow'
    ELSE 'red'
  END
$$;

-- Main admin routine: dry-run preview or apply
CREATE OR REPLACE FUNCTION public.admin_rescale_dust_emission_june_2026(p_dry_run boolean DEFAULT true)
RETURNS TABLE (
  employee_code text,
  employee_name text,
  kpi_id uuid,
  submission_id uuid,
  old_self_value numeric,
  new_cases numeric,
  old_self_score numeric,
  new_self_score numeric,
  old_manager_score numeric,
  new_manager_score numeric,
  old_hr_score numeric,
  new_hr_score numeric,
  old_final_score numeric,
  new_final_score numeric,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  r record;
  v_cases numeric;
  v_rating numeric;
  v_level text;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'ADR-175: only administrators may run the dust emission rescale';
  END IF;

  FOR r IN
    SELECT k.id AS kid, k.employee_id, k.uom_type, k.threshold_mode, k.criteria,
           k.r5, k.r4, k.r3, k.r2, k.r1, k.r0, k.qualitative_options,
           p.employee_code AS ecode, p.full_name AS ename,
           s.id AS sid, s.self_achieved_value, s.manager_achieved_value,
           s.auditor_achieved_value, s.hr_pms_achieved_value,
           s.skip_level_achieved_value, s.management_achieved_value,
           s.self_score, s.manager_score, s.auditor_score, s.hr_pms_score,
           s.skip_level_score, s.management_score, s.final_score,
           s.auto_advance_reason,
           to_jsonb(s.*) AS snap
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id
    LEFT JOIN public.review_submissions s ON s.kpi_id = k.id
    WHERE k.kpi_name ILIKE '%dust emission%'
      AND k.review_year = 2026
      AND k.review_period = 'June'
      AND k.uom_type = 'binary'
    ORDER BY p.employee_code
  LOOP
    -- Preserve deliberate admin deadline penalties (bulk zero-score batches)
    IF r.auto_advance_reason ILIKE '%bulk zero-score%' THEN
      employee_code := r.ecode; employee_name := r.ename; kpi_id := r.kid; submission_id := r.sid;
      old_self_value := r.self_achieved_value; new_cases := NULL;
      old_self_score := r.self_score; new_self_score := r.self_score;
      old_manager_score := r.manager_score; new_manager_score := r.manager_score;
      old_hr_score := r.hr_pms_score; new_hr_score := r.hr_pms_score;
      old_final_score := r.final_score; new_final_score := r.final_score;
      action := 'skipped: admin deadline zero-score preserved';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Semantic remap: binary stored the RATING (5 = "no case"); HR stored the CASE COUNT.
    -- Anything >= 5 is a rating-as-value artefact and means 0 cases.
    v_cases := COALESCE(r.hr_pms_achieved_value, r.manager_achieved_value, r.self_achieved_value);
    IF v_cases IS NOT NULL AND v_cases >= 5 THEN
      v_cases := 0;
    END IF;
    v_rating := public.dust_cases_to_rating(v_cases);
    v_level := public.dust_rating_to_level(v_rating);

    employee_code := r.ecode; employee_name := r.ename; kpi_id := r.kid; submission_id := r.sid;
    old_self_value := r.self_achieved_value; new_cases := v_cases;
    old_self_score := r.self_score;
    old_manager_score := r.manager_score;
    old_hr_score := r.hr_pms_score;
    old_final_score := r.final_score;
    -- Monotonic: never lower an existing score
    new_self_score := GREATEST(COALESCE(r.self_score, -1), COALESCE(v_rating, -1));
    new_manager_score := CASE WHEN r.manager_score IS NULL THEN NULL
                              ELSE GREATEST(r.manager_score, COALESCE(v_rating, r.manager_score)) END;
    new_hr_score := CASE WHEN r.hr_pms_score IS NULL THEN NULL
                         ELSE GREATEST(r.hr_pms_score, COALESCE(v_rating, r.hr_pms_score)) END;
    new_final_score := CASE WHEN r.final_score IS NULL THEN NULL
                            ELSE GREATEST(r.final_score, COALESCE(v_rating, r.final_score)) END;
    action := CASE WHEN p_dry_run THEN 'preview' ELSE 'applied' END;
    RETURN NEXT;

    IF p_dry_run THEN
      CONTINUE;
    END IF;

    -- Snapshot before write (idempotent per kpi)
    IF NOT EXISTS (SELECT 1 FROM public.kpi_dust_emission_rescale_2026_06 x WHERE x.kpi_id = r.kid) THEN
      INSERT INTO public.kpi_dust_emission_rescale_2026_06 (
        kpi_id, submission_id, employee_id, old_uom_type, old_threshold_mode,
        old_r5, old_r4, old_r3, old_r2, old_r1, old_r0, old_criteria,
        old_qualitative_options, old_submission, captured_by, note
      ) VALUES (
        r.kid, r.sid, r.employee_id, r.uom_type, r.threshold_mode,
        r.r5, r.r4, r.r3, r.r2, r.r1, r.r0, r.criteria,
        r.qualitative_options, r.snap, v_actor, 'ADR-175 pre-rescale snapshot'
      );
    END IF;

    -- 1) Definition: binary -> numeric absolute 6-band
    UPDATE public.kpis
       SET uom_type = 'numeric',
           threshold_mode = 'absolute',
           r5 = '0', r4 = '1', r3 = '2', r2 = '3', r1 = '4', r0 = '>4',
           qualitative_options = NULL,
           uom = COALESCE(NULLIF(uom, ''), 'Number of cases'),
           criteria = 'Control dust emission to make the plant environment compliant - PM.:'
                      || E'\n- Formula: Number of cases reported'
                      || E'\nScoring Logic: Rating 5:  0 case, Rating 4:  1 case, Rating 3:  2 case,'
                      || ' Rating 2:  3 case, Rating 1:  4 case, Rating 0:  >4 case,',
           updated_at = now()
     WHERE id = r.kid;

    -- 2) Values + scores, monotonic
    IF r.sid IS NOT NULL THEN
      UPDATE public.review_submissions s
         SET self_achieved_value = CASE WHEN s.self_achieved_value IS NULL THEN NULL ELSE v_cases END,
             manager_achieved_value = CASE WHEN s.manager_achieved_value IS NULL THEN NULL ELSE v_cases END,
             auditor_achieved_value = CASE WHEN s.auditor_achieved_value IS NULL THEN NULL ELSE v_cases END,
             hr_pms_achieved_value = CASE WHEN s.hr_pms_achieved_value IS NULL THEN NULL ELSE v_cases END,
             skip_level_achieved_value = CASE WHEN s.skip_level_achieved_value IS NULL THEN NULL ELSE v_cases END,
             management_achieved_value = CASE WHEN s.management_achieved_value IS NULL THEN NULL ELSE v_cases END,
             self_score = CASE WHEN s.self_score IS NULL THEN NULL ELSE GREATEST(s.self_score, v_rating) END,
             self_rating = CASE WHEN s.self_score IS NULL THEN s.self_rating
                                ELSE public.dust_rating_to_level(GREATEST(s.self_score, v_rating)) END,
             manager_score = CASE WHEN s.manager_score IS NULL THEN NULL ELSE GREATEST(s.manager_score, v_rating) END,
             manager_rating = CASE WHEN s.manager_score IS NULL THEN s.manager_rating
                                   ELSE public.dust_rating_to_level(GREATEST(s.manager_score, v_rating)) END,
             auditor_score = CASE WHEN s.auditor_score IS NULL THEN NULL ELSE GREATEST(s.auditor_score, v_rating) END,
             auditor_rating = CASE WHEN s.auditor_score IS NULL THEN s.auditor_rating
                                   ELSE public.dust_rating_to_level(GREATEST(s.auditor_score, v_rating)) END,
             hr_pms_score = CASE WHEN s.hr_pms_score IS NULL THEN NULL ELSE GREATEST(s.hr_pms_score, v_rating) END,
             hr_pms_rating = CASE WHEN s.hr_pms_score IS NULL THEN s.hr_pms_rating
                                  ELSE public.dust_rating_to_level(GREATEST(s.hr_pms_score, v_rating)) END,
             skip_level_score = CASE WHEN s.skip_level_score IS NULL THEN NULL ELSE GREATEST(s.skip_level_score, v_rating) END,
             skip_level_rating = CASE WHEN s.skip_level_score IS NULL THEN s.skip_level_rating
                                      ELSE public.dust_rating_to_level(GREATEST(s.skip_level_score, v_rating)) END,
             management_score = CASE WHEN s.management_score IS NULL THEN NULL ELSE GREATEST(s.management_score, v_rating) END,
             management_rating = CASE WHEN s.management_score IS NULL THEN s.management_rating
                                      ELSE public.dust_rating_to_level(GREATEST(s.management_score, v_rating)) END,
             final_score = CASE WHEN s.final_score IS NULL THEN NULL ELSE GREATEST(s.final_score, v_rating) END,
             final_rating = CASE WHEN s.final_score IS NULL THEN s.final_rating
                                 ELSE public.dust_rating_to_level(GREATEST(s.final_score, v_rating)) END,
             final_score_explanation = CASE WHEN s.final_score IS NULL THEN s.final_score_explanation
                                            ELSE 'ADR-175 dust emission rescale (monotonic upgrade)' END,
             updated_at = now()
       WHERE s.id = r.sid;

      INSERT INTO public.kpi_audit_logs (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata)
      VALUES (
        r.kid, r.sid, 'adr175_dust_emission_rescale', v_actor,
        jsonb_build_object('self_achieved_value', r.self_achieved_value,
                           'self_score', r.self_score,
                           'manager_score', r.manager_score,
                           'hr_pms_score', r.hr_pms_score,
                           'final_score', r.final_score,
                           'uom_type', r.uom_type),
        jsonb_build_object('cases', v_cases, 'rating', v_rating, 'uom_type', 'numeric'),
        jsonb_build_object('adr', 'ADR-175', 'scope', 'June 2026', 'monotonic', true)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rescale_dust_emission_june_2026(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rescale_dust_emission_june_2026(boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_rescale_dust_emission_june_2026(boolean) IS
  'ADR-175: admin-only, idempotent, monotonic rescale of the June 2026 Control dust emission KPI from binary to a numeric 6-band case-count scale.';
-- ADR-196: complete the Functional Manager (F1) stage column set on review_submissions.
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS functional_manager_achieved_value numeric,
  ADD COLUMN IF NOT EXISTS functional_manager_evidence_url text;

-- Peer parity: every other stage's *_evidence_urls is nullable with a '[]' default.
ALTER TABLE public.review_submissions
  ALTER COLUMN functional_manager_evidence_urls DROP NOT NULL;

-- Restore the FM branch that was removed when the column did not exist.
CREATE OR REPLACE FUNCTION public.enforce_self_snapshot_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reviewer_stage_touched boolean;
BEGIN
  IF NEW.self_achieved_value IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.achieved_value IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.self_score IS NULL THEN
    RETURN NEW;
  END IF;

  reviewer_stage_touched :=
       (NEW.manager_achieved_value            IS DISTINCT FROM OLD.manager_achieved_value)
    OR (NEW.functional_manager_achieved_value IS DISTINCT FROM OLD.functional_manager_achieved_value)
    OR (NEW.skip_level_achieved_value         IS DISTINCT FROM OLD.skip_level_achieved_value)
    OR (NEW.hr_pms_achieved_value             IS DISTINCT FROM OLD.hr_pms_achieved_value)
    OR (NEW.auditor_achieved_value            IS DISTINCT FROM OLD.auditor_achieved_value)
    OR (NEW.management_achieved_value         IS DISTINCT FROM OLD.management_achieved_value);

  IF reviewer_stage_touched THEN
    RETURN NEW;
  END IF;

  NEW.self_achieved_value := NEW.achieved_value;
  RETURN NEW;
END;
$function$;

-- Self-guard parity: FM score/rating/url/achieved_value are reviewer fields too.
CREATE OR REPLACE FUNCTION public.tg_review_submissions_self_column_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_employee_id uuid;
  v_is_privileged boolean;
  v_bypass text;
BEGIN
  BEGIN
    v_bypass := current_setting('app.self_submit_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT k.employee_id INTO v_employee_id
  FROM public.kpis k
  WHERE k.id = COALESCE(NEW.kpi_id, OLD.kpi_id);

  IF v_employee_id IS DISTINCT FROM v_uid THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_privileged :=
       public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'hr_pms'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role);

  IF v_is_privileged THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.manager_score IS NOT NULL OR NEW.manager_rating IS NOT NULL OR NEW.manager_remarks IS NOT NULL
       OR NEW.manager_evidence_url IS NOT NULL OR NEW.manager_achieved_value IS NOT NULL
       OR NEW.functional_manager_score IS NOT NULL OR NEW.functional_manager_rating IS NOT NULL
       OR NEW.functional_manager_remarks IS NOT NULL OR NEW.functional_manager_evidence_url IS NOT NULL
       OR NEW.functional_manager_achieved_value IS NOT NULL
       OR NEW.auditor_score IS NOT NULL OR NEW.auditor_rating IS NOT NULL OR NEW.auditor_remarks IS NOT NULL
       OR NEW.auditor_evidence_url IS NOT NULL OR NEW.auditor_achieved_value IS NOT NULL
       OR NEW.management_score IS NOT NULL OR NEW.management_rating IS NOT NULL OR NEW.management_remarks IS NOT NULL
       OR NEW.management_evidence_url IS NOT NULL OR NEW.management_achieved_value IS NOT NULL
       OR NEW.final_score IS NOT NULL OR NEW.final_rating IS NOT NULL
    THEN
      RAISE EXCEPTION 'Employees cannot set reviewer fields on review_submissions (self-guard)';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.manager_score       IS DISTINCT FROM OLD.manager_score
   OR NEW.manager_rating     IS DISTINCT FROM OLD.manager_rating
   OR NEW.manager_remarks    IS DISTINCT FROM OLD.manager_remarks
   OR NEW.manager_evidence_url    IS DISTINCT FROM OLD.manager_evidence_url
   OR NEW.manager_evidence_urls   IS DISTINCT FROM OLD.manager_evidence_urls
   OR NEW.manager_achieved_value  IS DISTINCT FROM OLD.manager_achieved_value
   OR NEW.auditor_score      IS DISTINCT FROM OLD.auditor_score
   OR NEW.auditor_rating     IS DISTINCT FROM OLD.auditor_rating
   OR NEW.auditor_remarks    IS DISTINCT FROM OLD.auditor_remarks
   OR NEW.auditor_evidence_url    IS DISTINCT FROM OLD.auditor_evidence_url
   OR NEW.auditor_evidence_urls   IS DISTINCT FROM OLD.auditor_evidence_urls
   OR NEW.auditor_achieved_value  IS DISTINCT FROM OLD.auditor_achieved_value
   OR NEW.management_score   IS DISTINCT FROM OLD.management_score
   OR NEW.management_rating  IS DISTINCT FROM OLD.management_rating
   OR NEW.management_remarks IS DISTINCT FROM OLD.management_remarks
   OR NEW.management_evidence_url    IS DISTINCT FROM OLD.management_evidence_url
   OR NEW.management_evidence_urls   IS DISTINCT FROM OLD.management_evidence_urls
   OR NEW.management_achieved_value  IS DISTINCT FROM OLD.management_achieved_value
   OR NEW.final_score        IS DISTINCT FROM OLD.final_score
   OR NEW.final_rating       IS DISTINCT FROM OLD.final_rating
   OR NEW.final_score_rule_type       IS DISTINCT FROM OLD.final_score_rule_type
   OR NEW.final_score_rule_snapshot   IS DISTINCT FROM OLD.final_score_rule_snapshot
   OR NEW.final_score_explanation     IS DISTINCT FROM OLD.final_score_explanation
   OR NEW.final_score_calculated_at   IS DISTINCT FROM OLD.final_score_calculated_at
   OR NEW.functional_manager_score          IS DISTINCT FROM OLD.functional_manager_score
   OR NEW.functional_manager_rating         IS DISTINCT FROM OLD.functional_manager_rating
   OR NEW.functional_manager_remarks        IS DISTINCT FROM OLD.functional_manager_remarks
   OR NEW.functional_manager_evidence_url   IS DISTINCT FROM OLD.functional_manager_evidence_url
   OR NEW.functional_manager_evidence_urls  IS DISTINCT FROM OLD.functional_manager_evidence_urls
   OR NEW.functional_manager_achieved_value IS DISTINCT FROM OLD.functional_manager_achieved_value
   OR NEW.kpi_id             IS DISTINCT FROM OLD.kpi_id
   OR NEW.kpi_status         IS DISTINCT FROM OLD.kpi_status
   OR NEW.is_na              IS DISTINCT FROM OLD.is_na
  THEN
    RAISE EXCEPTION 'Employees cannot modify reviewer or workflow fields on review_submissions (self-guard)';
  END IF;

  RETURN NEW;
END;
$function$;
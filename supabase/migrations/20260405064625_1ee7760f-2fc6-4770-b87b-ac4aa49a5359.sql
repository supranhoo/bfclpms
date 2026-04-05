
CREATE OR REPLACE FUNCTION public.log_untracked_submission_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.management_score IS DISTINCT FROM NEW.management_score
     OR OLD.auditor_score IS DISTINCT FROM NEW.auditor_score
     OR OLD.final_score IS DISTINCT FROM NEW.final_score
     OR OLD.self_score IS DISTINCT FROM NEW.self_score
     OR OLD.manager_score IS DISTINCT FROM NEW.manager_score
     OR OLD.skip_level_score IS DISTINCT FROM NEW.skip_level_score
     OR OLD.hr_pms_score IS DISTINCT FROM NEW.hr_pms_score THEN

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.kpi_id,
      'SUBMISSION_SCORE_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'self_score', OLD.self_score,
        'manager_score', OLD.manager_score,
        'skip_level_score', OLD.skip_level_score,
        'hr_pms_score', OLD.hr_pms_score,
        'auditor_score', OLD.auditor_score,
        'management_score', OLD.management_score,
        'final_score', OLD.final_score
      ),
      jsonb_build_object(
        'self_score', NEW.self_score,
        'manager_score', NEW.manager_score,
        'skip_level_score', NEW.skip_level_score,
        'hr_pms_score', NEW.hr_pms_score,
        'auditor_score', NEW.auditor_score,
        'management_score', NEW.management_score,
        'final_score', NEW.final_score
      ),
      jsonb_build_object('source', 'safety_net_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_untracked_submission_changes ON public.review_submissions;

CREATE TRIGGER trg_log_untracked_submission_changes
  AFTER UPDATE ON public.review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_untracked_submission_changes();

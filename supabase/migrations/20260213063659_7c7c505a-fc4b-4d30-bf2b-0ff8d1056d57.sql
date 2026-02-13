-- Safety-net trigger: auto-reset review_submissions.kpi_status when kpis.status goes back to kra_set
CREATE OR REPLACE FUNCTION public.sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.review_submissions
    SET kpi_status = 'open',
        updated_at = now()
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_sync_submission_on_kra_set
AFTER UPDATE OF status ON public.kpis
FOR EACH ROW
EXECUTE FUNCTION public.sync_submission_on_kra_set();
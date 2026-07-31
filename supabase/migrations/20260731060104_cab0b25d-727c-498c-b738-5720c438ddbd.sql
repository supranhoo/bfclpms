CREATE OR REPLACE FUNCTION public.ar_draft_implies_pending_self()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reviewer_role = 'self' THEN
    UPDATE public.annual_review_instances
    SET overall_status = 'pending_self', updated_at = now()
    WHERE id = NEW.instance_id
      AND overall_status = 'not_started';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_draft_implies_pending_self ON public.annual_review_responses;
CREATE TRIGGER trg_ar_draft_implies_pending_self
AFTER INSERT OR UPDATE ON public.annual_review_responses
FOR EACH ROW
EXECUTE FUNCTION public.ar_draft_implies_pending_self();
-- ADR-114: Assisted (proxy) self submit MUST require a saved, scored self response.

CREATE OR REPLACE FUNCTION public.submit_annual_review_self_as_proxy(p_instance_id uuid, p_proxy_submission_id uuid)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_next annual_review_status;
  v_audit_match uuid;
  v_has_scored_self boolean;
BEGIN
  IF NOT public.can_proxy_submit_annual_review(p_instance_id, v_caller) THEN
    RAISE EXCEPTION 'caller is not an eligible proxy for instance %', p_instance_id;
  END IF;

  SELECT id INTO v_audit_match
  FROM public.annual_review_proxy_submissions
  WHERE id = p_proxy_submission_id
    AND instance_id = p_instance_id
    AND proxy_user_id = v_caller;
  IF v_audit_match IS NULL THEN
    RAISE EXCEPTION 'proxy audit row missing or does not match';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.annual_review_responses
    WHERE instance_id = p_instance_id
      AND reviewer_role = 'self'
      AND weighted_score IS NOT NULL
  ) INTO v_has_scored_self;
  IF NOT v_has_scored_self THEN
    RAISE EXCEPTION 'proxy_submit_requires_self_scores'
      USING HINT = 'Fill and save the self scoring form before assisted submission.';
  END IF;

  UPDATE public.annual_review_responses
     SET is_locked = true, submitted_at = COALESCE(submitted_at, now())
   WHERE instance_id = p_instance_id AND reviewer_role = 'self';

  SELECT public.annual_review_next_status(enabled_stages, overall_status)
    INTO v_next
  FROM public.annual_review_instances WHERE id = p_instance_id;

  UPDATE public.annual_review_instances
     SET overall_status = v_next,
         submitted_via_proxy = true,
         proxy_submission_id = p_proxy_submission_id,
         updated_at = now()
   WHERE id = p_instance_id;

  RETURN v_next;
END;
$function$;

WITH targets AS (
  SELECT ari.id
  FROM public.annual_review_instances ari
  WHERE ari.submitted_via_proxy = true
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = ari.id AND r.reviewer_role = 'self'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_responses r WHERE r.instance_id = ari.id
    )
    AND ari.overall_status <> 'pending_self'
), upd AS (
  UPDATE public.annual_review_instances ari
     SET overall_status = 'pending_self',
         updated_at = now()
    FROM targets
   WHERE ari.id = targets.id
   RETURNING ari.id
)
INSERT INTO public.system_audit_logs (action, performed_by, metadata)
SELECT 'annual_review.proxy_submit.regress_missing_self',
       NULL,
       jsonb_build_object('instance_id', id, 'reason', 'ADR-114 restoration: proxy advance without self scores')
FROM upd;
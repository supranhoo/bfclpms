
-- ADR-115: assisted-submit guard now reads criteria_scores, not weighted_score.
-- Also computes weighted_score at proxy submission time (parity with self path).

CREATE OR REPLACE FUNCTION public.submit_annual_review_self_as_proxy(
  p_instance_id uuid,
  p_proxy_submission_id uuid
)
RETURNS annual_review_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_next annual_review_status;
  v_audit_match uuid;
  v_has_scored_criterion boolean;
  v_weighted numeric;
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

  -- ADR-115: draft auto-save never writes weighted_score (that only happens
  -- inside advance_annual_review_status). The true "form has content" signal
  -- is >=1 numeric criterion in criteria_scores.
  SELECT EXISTS (
    SELECT 1
      FROM public.annual_review_responses r,
           LATERAL jsonb_each(COALESCE(r.criteria_scores, '{}'::jsonb)) AS kv(k, v)
     WHERE r.instance_id = p_instance_id
       AND r.reviewer_role = 'self'
       AND jsonb_typeof(v) = 'number'
  ) INTO v_has_scored_criterion;

  IF NOT v_has_scored_criterion THEN
    RAISE EXCEPTION 'proxy_submit_requires_self_scores'
      USING HINT = 'Fill and save the self scoring form before assisted submission.';
  END IF;

  -- Compute weighted_score so proxy submissions match the normal self path.
  v_weighted := public.compute_annual_review_weighted_score(p_instance_id, 'self');

  UPDATE public.annual_review_responses
     SET is_locked = true,
         submitted_at = COALESCE(submitted_at, now()),
         weighted_score = COALESCE(v_weighted, weighted_score)
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

-- One-shot backfill: recompute weighted_score for self responses that already
-- have numeric criteria saved but never got a computed weighted_score
-- (all pre-ADR-115 proxy candidates).
UPDATE public.annual_review_responses r
   SET weighted_score = public.compute_annual_review_weighted_score(r.instance_id, 'self')
 WHERE r.reviewer_role = 'self'
   AND r.weighted_score IS NULL
   AND EXISTS (
     SELECT 1 FROM jsonb_each(COALESCE(r.criteria_scores, '{}'::jsonb)) AS kv(k, v)
      WHERE jsonb_typeof(v) = 'number'
   );

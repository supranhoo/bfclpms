
-- Allow eligible proxy to upsert self response on behalf of employee
DROP POLICY IF EXISTS "responses_self_insert" ON public.annual_review_responses;
CREATE POLICY "responses_self_insert"
  ON public.annual_review_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR reviewer_id = auth.uid()
    OR (reviewer_role = 'self' AND public.can_proxy_submit_annual_review(instance_id, auth.uid()))
  );

DROP POLICY IF EXISTS "responses_self_update" ON public.annual_review_responses;
CREATE POLICY "responses_self_update"
  ON public.annual_review_responses
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR (reviewer_id = auth.uid() AND is_locked = false)
    OR (reviewer_role = 'self' AND is_locked = false AND public.can_proxy_submit_annual_review(instance_id, auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR reviewer_id = auth.uid()
    OR (reviewer_role = 'self' AND public.can_proxy_submit_annual_review(instance_id, auth.uid()))
  );

-- Proxy-aware advance: locks self response and flags instance as proxy-submitted
CREATE OR REPLACE FUNCTION public.submit_annual_review_self_as_proxy(
  p_instance_id uuid,
  p_proxy_submission_id uuid
) RETURNS annual_review_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_next annual_review_status;
  v_audit_match uuid;
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
$$;

GRANT EXECUTE ON FUNCTION public.submit_annual_review_self_as_proxy(uuid, uuid) TO authenticated;

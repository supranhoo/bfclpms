
-- POLICY §AR-SELF-DRAFT-OWNERSHIP

CREATE TABLE IF NOT EXISTS public.annual_review_self_draft_reassign_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid,
  instance_id uuid NOT NULL,
  response_id uuid NOT NULL,
  old_reviewer_id uuid,
  new_reviewer_id uuid,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_self_draft_reassign_audit TO authenticated;
GRANT ALL ON public.annual_review_self_draft_reassign_audit TO service_role;
ALTER TABLE public.annual_review_self_draft_reassign_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_draft_reassign_audit_admin_read
  ON public.annual_review_self_draft_reassign_audit FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

-- 1) DATA REPAIR
WITH bad AS (
  SELECT arr.id AS response_id, arr.instance_id, arr.reviewer_id AS old_reviewer,
         ari.employee_id AS new_reviewer, ari.cycle_id
  FROM public.annual_review_responses arr
  JOIN public.annual_review_instances ari ON ari.id = arr.instance_id
  WHERE arr.reviewer_role = 'self'
    AND arr.submitted_at IS NULL
    AND arr.is_locked = false
    AND ari.overall_status = 'pending_self'
    AND arr.reviewer_id <> ari.employee_id
),
logged AS (
  INSERT INTO public.annual_review_self_draft_reassign_audit
    (cycle_id, instance_id, response_id, old_reviewer_id, new_reviewer_id, reason)
  SELECT cycle_id, instance_id, response_id, old_reviewer, new_reviewer,
         'self_proxy_draft_reassigned_v1'
  FROM bad
  RETURNING 1
)
UPDATE public.annual_review_responses arr
SET reviewer_id = bad.new_reviewer, updated_at = now()
FROM bad
WHERE arr.id = bad.response_id;

-- 2) RLS — allow reviewee to read/edit own self draft while pending_self
DROP POLICY IF EXISTS responses_select_visible ON public.annual_review_responses;
CREATE POLICY responses_select_visible ON public.annual_review_responses
FOR SELECT USING (
  (reviewer_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (
    reviewer_role = 'self'::annual_reviewer_role
    AND EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = annual_review_responses.instance_id
        AND i.employee_id = auth.uid()
        AND i.overall_status = 'pending_self'::annual_review_status
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
    WHERE i.id = annual_review_responses.instance_id
      AND (
        (i.employee_id = auth.uid() AND i.overall_status = 'completed'::annual_review_status)
        OR i.manager_id = auth.uid()
        OR i.skip_id = auth.uid()
        OR i.bu_head_id = auth.uid()
        OR i.hr_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS responses_self_update ON public.annual_review_responses;
CREATE POLICY responses_self_update ON public.annual_review_responses
FOR UPDATE USING (
  has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'hr_pms'::app_role)
  OR ((reviewer_id = auth.uid()) AND (is_locked = false))
  OR (
    reviewer_role = 'self'::annual_reviewer_role
    AND is_locked = false
    AND EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = annual_review_responses.instance_id
        AND i.employee_id = auth.uid()
        AND i.overall_status = 'pending_self'::annual_review_status
    )
  )
  OR (
    reviewer_role = 'self'::annual_reviewer_role
    AND is_locked = false
    AND can_proxy_submit_annual_review(instance_id, auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'hr_pms'::app_role)
  OR (reviewer_id = auth.uid())
  OR (
    reviewer_role = 'self'::annual_reviewer_role
    AND EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = annual_review_responses.instance_id
        AND i.employee_id = auth.uid()
        AND i.overall_status = 'pending_self'::annual_review_status
    )
  )
  OR (
    reviewer_role = 'self'::annual_reviewer_role
    AND can_proxy_submit_annual_review(instance_id, auth.uid())
  )
);

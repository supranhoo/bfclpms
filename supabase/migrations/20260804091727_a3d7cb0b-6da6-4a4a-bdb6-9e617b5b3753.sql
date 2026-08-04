-- ADR-246 security hardening: employees must not be able to write reviewer-owned
-- score columns during their own self-review (privilege escalation via UPDATE).
DROP POLICY IF EXISTS "Employees can update self review fields" ON public.review_submissions;

CREATE POLICY "Employees can update self review fields"
ON public.review_submissions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND k.employee_id = auth.uid()
      AND k.status = 'self_review'::review_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND k.employee_id = auth.uid()
      AND k.status = 'self_review'::review_status
  )
  AND manager_score IS NULL
  AND manager_rating IS NULL
  AND manager_remarks IS NULL
  AND manager_evidence_url IS NULL
  AND manager_achieved_value IS NULL
  AND auditor_score IS NULL
  AND auditor_rating IS NULL
  AND auditor_remarks IS NULL
  AND auditor_evidence_url IS NULL
  AND auditor_achieved_value IS NULL
  AND management_score IS NULL
  AND management_rating IS NULL
  AND management_remarks IS NULL
  AND management_evidence_url IS NULL
  AND management_achieved_value IS NULL
  AND final_score IS NULL
  AND final_rating IS NULL
);
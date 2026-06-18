
-- 1. Remove overly broad SELECT on review-evidence bucket
DROP POLICY IF EXISTS "Authenticated users can view evidence files" ON storage.objects;

-- 2. Tighten annual_score_config_audit INSERT policy
DROP POLICY IF EXISTS annual_score_audit_insert_authenticated ON public.annual_score_config_audit;
CREATE POLICY annual_score_audit_insert_admin_hrpms
  ON public.annual_score_config_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
  );

-- 3. Remove anon SELECT on reference tables
DROP POLICY IF EXISTS "employment_statuses readable by anon" ON public.employment_statuses;
DROP POLICY IF EXISTS "employee_categories readable by anon" ON public.employee_categories;

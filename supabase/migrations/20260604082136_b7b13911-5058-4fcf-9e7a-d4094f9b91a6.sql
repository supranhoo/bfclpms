
-- 1) employee_master_custom_field_values: replace open SELECT
DROP POLICY IF EXISTS "emcfv_select_authenticated" ON public.employee_master_custom_field_values;

CREATE POLICY "emcfv_select_scoped"
ON public.employee_master_custom_field_values
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = employee_master_custom_field_values.employee_id
      AND p.reporting_manager_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  OR public.has_role(auth.uid(), 'management'::public.app_role)
);

-- 2) incentive_custom_tab_data: replace ALL-true policy with scoped read + admin/hr writes
DROP POLICY IF EXISTS "Auth users manage custom tab data" ON public.incentive_custom_tab_data;

CREATE POLICY "ictd_select_scoped"
ON public.incentive_custom_tab_data
FOR SELECT
TO authenticated
USING (
  employee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = incentive_custom_tab_data.employee_id
      AND p.reporting_manager_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  OR public.has_role(auth.uid(), 'management'::public.app_role)
);

CREATE POLICY "ictd_insert_admin_hr"
ON public.incentive_custom_tab_data
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
);

CREATE POLICY "ictd_update_admin_hr"
ON public.incentive_custom_tab_data
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
);

CREATE POLICY "ictd_delete_admin_hr"
ON public.incentive_custom_tab_data
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
);

-- 3) kpi_rollback_requests: replace open SELECT with scoped view
DROP POLICY IF EXISTS "Authenticated users can view rollback requests" ON public.kpi_rollback_requests;

CREATE POLICY "krr_select_scoped"
ON public.kpi_rollback_requests
FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = kpi_rollback_requests.kpi_id
      AND (
        k.employee_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = k.employee_id
            AND p.reporting_manager_id = auth.uid()
        )
      )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  OR public.has_role(auth.uid(), 'management'::public.app_role)
  OR public.has_role(auth.uid(), 'auditor'::public.app_role)
);

-- 4) review_period_audit_log: restrict SELECT to admin / hr_pms
DROP POLICY IF EXISTS "Authenticated users can view audit log" ON public.review_period_audit_log;

CREATE POLICY "rpal_select_admin_hr"
ON public.review_period_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
);

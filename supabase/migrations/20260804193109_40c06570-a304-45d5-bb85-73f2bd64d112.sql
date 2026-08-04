-- ADR-250 (1/2): SECURITY DEFINER slim read for the full KPI list.
-- Mirrors get_reviewer_kpis_for_period but without a period filter, so
-- `useAllKpis` stops paging 20k rows through per-row RLS (267k calls,
-- 591ms mean, 158,373s total server time in pg_stat_statements).
CREATE OR REPLACE FUNCTION public.get_all_kpis_slim()
RETURNS TABLE(
  id uuid, employee_id uuid, category_id uuid, kra_name text, kpi_name text,
  status text, weightage numeric, review_period text, review_year integer,
  frequency text, is_org_level boolean, org_level_scope text, uom text,
  uom_type text, criteria text, target_value numeric, r5 text, r4 text,
  r3 text, r2 text, r1 text, r0 text, sub_frequency text,
  frequency_cycle_start text, source_template_id uuid, threshold_mode text,
  source_of_data text, qualitative_options jsonb, is_issued boolean,
  ref_code text, is_frequency_locked boolean, require_resubmit_reason boolean,
  day_count_type text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full boolean;
BEGIN
  PERFORM set_config('statement_timeout', '30000', true);

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_full := has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'auditor'::app_role)
    OR has_role(v_uid, 'hr_pms'::app_role)
    OR has_role(v_uid, 'management'::app_role)
    OR has_report_access_override(v_uid);

  IF v_is_full THEN
    RETURN QUERY
      SELECT k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
             k.status::text, k.weightage, k.review_period, k.review_year,
             k.frequency, k.is_org_level, k.org_level_scope::text, k.uom,
             k.uom_type::text, k.criteria, k.target_value,
             k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
             k.sub_frequency, k.frequency_cycle_start::text, k.source_template_id,
             k.threshold_mode::text, k.source_of_data, k.qualitative_options,
             k.is_issued, k.ref_code, k.is_frequency_locked,
             k.require_resubmit_reason, k.day_count_type::text,
             k.created_at, k.updated_at
      FROM public.kpis k
      ORDER BY k.id ASC;
  ELSE
    RETURN QUERY
      WITH directs AS (
        SELECT p.id AS profile_id FROM public.profiles p
        WHERE p.is_active = true AND p.reporting_manager_id = v_uid
      ),
      indirects AS (
        SELECT p.id AS profile_id FROM public.profiles p
        WHERE p.is_active = true
          AND p.reporting_manager_id IN (SELECT d.profile_id FROM directs d)
      ),
      visible AS (
        SELECT v_uid AS profile_id
        UNION SELECT d.profile_id FROM directs d
        UNION SELECT i.profile_id FROM indirects i
      )
      SELECT k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
             k.status::text, k.weightage, k.review_period, k.review_year,
             k.frequency, k.is_org_level, k.org_level_scope::text, k.uom,
             k.uom_type::text, k.criteria, k.target_value,
             k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
             k.sub_frequency, k.frequency_cycle_start::text, k.source_template_id,
             k.threshold_mode::text, k.source_of_data, k.qualitative_options,
             k.is_issued, k.ref_code, k.is_frequency_locked,
             k.require_resubmit_reason, k.day_count_type::text,
             k.created_at, k.updated_at
      FROM public.kpis k
      WHERE k.employee_id IN (SELECT v.profile_id FROM visible v)
      ORDER BY k.id ASC;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_all_kpis_slim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_kpis_slim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_kpis_slim() TO service_role;

-- ADR-250 (2/2): cache the review-evidence participation test once per
-- statement instead of re-evaluating auth.uid() six times per object row.
CREATE OR REPLACE FUNCTION public.can_read_kpi_evidence(p_kpi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.kpis k
    LEFT JOIN public.profiles emp ON emp.id = k.employee_id
    LEFT JOIN public.profiles mgr ON mgr.id = emp.reporting_manager_id
    WHERE k.id = p_kpi_id
      AND (
        k.employee_id = (SELECT auth.uid())
        OR emp.reporting_manager_id = (SELECT auth.uid())
        OR mgr.reporting_manager_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.audit_kpi_assignments a
          WHERE a.employee_id = k.employee_id AND a.auditor_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.audit_kpi_level_assignments la
          WHERE la.kpi_id = k.id AND la.auditor_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.kpi_mention_access m
          WHERE m.kpi_id = k.id AND m.user_id = (SELECT auth.uid())
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_read_kpi_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_kpi_evidence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_kpi_evidence(uuid) TO service_role;

DROP POLICY IF EXISTS "Review evidence readable by KPI participants" ON storage.objects;
CREATE POLICY "Review evidence readable by KPI participants"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    (storage.foldername(name))[3] IS NULL
    OR (storage.foldername(name))[3] = ANY (ARRAY[
      'self-evidence','reviewer-evidence','auditor-evidence',
      'management-evidence','observation-evidence','observation-replies'
    ])
  )
  AND public.can_read_kpi_evidence(((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Observation evidence readable by KPI participants" ON storage.objects;
CREATE POLICY "Observation evidence readable by KPI participants"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[3] = 'observation-evidence'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND public.can_read_kpi_evidence(((storage.foldername(name))[2])::uuid)
);
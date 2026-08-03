ALTER TABLE public.report_access_config
  ADD COLUMN IF NOT EXISTS requires_employee_data boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.report_access_config.requires_employee_data IS
  'ADR-237: when true, a per-user override on this report_key also grants row access to employee-level tables (profiles, kpis, review_submissions, org_kpi_values). Fail-closed default: false.';

-- Preserve today''s effective access for report keys that are actually granted.
UPDATE public.report_access_config
   SET requires_employee_data = true, updated_at = now()
 WHERE report_key IN (
   SELECT DISTINCT report_key
   FROM public.report_access_user_overrides
   WHERE can_view = true OR can_download = true
 );

-- ADR-237: scope the override to reports that declare they need employee-level data.
CREATE OR REPLACE FUNCTION public.has_report_access_override(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.report_access_user_overrides o
    JOIN public.report_access_config c ON c.report_key = o.report_key
    WHERE o.user_id = _user_id
      AND (o.can_view = true OR o.can_download = true)
      AND c.requires_employee_data = true
  )
$function$;
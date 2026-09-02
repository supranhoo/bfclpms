-- ADR-341 — Target belongs to value-based KPIs only.
--
-- Yes/No and tiered KPIs are scored from qualitative_options; a numeric target
-- there is read by no scoring path and only contradicts the Admin KPI Editor,
-- which has always hidden the field. One trigger enforces the invariant across
-- every write path (group edit, row override, bulk tuning, rollover, copy KRAs,
-- import), so no client, script or future surface can reintroduce it.

CREATE OR REPLACE FUNCTION public.enforce_target_is_value_based()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.uom_type, 'numeric') <> 'numeric' THEN
    NEW.target_value := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_target_is_value_based ON public.kpis;
CREATE TRIGGER trg_enforce_target_is_value_based
BEFORE INSERT OR UPDATE OF uom_type, target_value ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.enforce_target_is_value_based();

-- Reversible audit archive for the one-off residue cleanup.
CREATE TABLE IF NOT EXISTS public.kpi_non_numeric_target_cleanup_2026_09 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_id uuid NOT NULL,
  employee_id uuid,
  kra_name text,
  kpi_name text,
  uom_type text,
  review_period text,
  review_year integer,
  old_target_value numeric,
  cleaned_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kpi_non_numeric_target_cleanup_2026_09 TO authenticated;
GRANT ALL ON public.kpi_non_numeric_target_cleanup_2026_09 TO service_role;

ALTER TABLE public.kpi_non_numeric_target_cleanup_2026_09 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read target cleanup archive"
ON public.kpi_non_numeric_target_cleanup_2026_09
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
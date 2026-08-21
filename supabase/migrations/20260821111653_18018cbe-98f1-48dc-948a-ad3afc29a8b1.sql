CREATE OR REPLACE FUNCTION public.can_read_evidence_context(
  p_context_id uuid,
  p_folder text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _kpi_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_context_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_folder = ANY (ARRAY['observation-evidence'::text, 'observation-replies'::text]) THEN
    SELECT o.kpi_id
      INTO _kpi_id
      FROM public.kpi_observations o
     WHERE o.id = p_context_id;
  END IF;

  IF _kpi_id IS NULL THEN
    SELECT k.id
      INTO _kpi_id
      FROM public.kpis k
     WHERE k.id = p_context_id;
  END IF;

  IF _kpi_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.can_read_kpi_evidence(_kpi_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_read_evidence_context(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_evidence_context(uuid, text) TO authenticated, service_role;
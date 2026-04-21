-- Phase A4: Read-only preview RPC mirroring propagate_org_kpi_value's row eligibility logic.
-- No writes; safe to call from any UI.

CREATE OR REPLACE FUNCTION public.preview_org_kpi_propagation(
  p_kpi_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_will_advance int := 0;
  v_will_skip int := 0;
  v_total int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  rec record;
BEGIN
  IF p_kpi_ids IS NULL OR array_length(p_kpi_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'total', 0,
      'will_advance', 0,
      'will_skip', 0,
      'breakdown', '[]'::jsonb
    );
  END IF;

  FOR rec IN
    SELECT
      k_id AS kpi_id,
      k.status::text AS current_status,
      k.employee_id,
      p.full_name,
      p.employee_code
    FROM unnest(p_kpi_ids) AS k_id
    LEFT JOIN kpis k ON k.id = k_id
    LEFT JOIN profiles p ON p.id = k.employee_id
  LOOP
    v_total := v_total + 1;

    IF rec.current_status IS NULL THEN
      v_will_skip := v_will_skip + 1;
      v_breakdown := v_breakdown || jsonb_build_object(
        'kpi_id', rec.kpi_id,
        'employee_name', NULL,
        'employee_code', NULL,
        'current_status', 'missing',
        'will_advance', false,
        'reason', 'kpi_not_found'
      );
    ELSIF rec.current_status = 'kra_set' THEN
      v_will_advance := v_will_advance + 1;
      v_breakdown := v_breakdown || jsonb_build_object(
        'kpi_id', rec.kpi_id,
        'employee_name', rec.full_name,
        'employee_code', rec.employee_code,
        'current_status', rec.current_status,
        'will_advance', true,
        'reason', 'eligible'
      );
    ELSE
      v_will_skip := v_will_skip + 1;
      v_breakdown := v_breakdown || jsonb_build_object(
        'kpi_id', rec.kpi_id,
        'employee_name', rec.full_name,
        'employee_code', rec.employee_code,
        'current_status', rec.current_status,
        'will_advance', false,
        'reason', 'not_in_kra_set'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'will_advance', v_will_advance,
    'will_skip', v_will_skip,
    'breakdown', v_breakdown
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_org_kpi_propagation(uuid[]) IS
  'v2.66.1 (Phase A4): Read-only preview of which org KPIs would actually advance on a Propagate click. Mirrors propagate_org_kpi_value eligibility (kra_set only). Returns {total, will_advance, will_skip, breakdown[]}.';

GRANT EXECUTE ON FUNCTION public.preview_org_kpi_propagation(uuid[]) TO authenticated;
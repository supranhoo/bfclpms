
CREATE OR REPLACE FUNCTION public.bulk_upsert_org_kpi_values(p_rows jsonb)
RETURNS TABLE(id uuid, was_insert boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_id uuid;
  v_existing_id uuid;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    -- Look up existing row via the partial-unique scope index columns
    SELECT okv.id INTO v_existing_id
    FROM public.org_kpi_values okv
    WHERE okv.category_id  = (r->>'category_id')::uuid
      AND okv.kra_name     = (r->>'kra_name')
      AND okv.kpi_name     = (r->>'kpi_name')
      AND okv.review_period = (r->>'review_period')
      AND okv.review_year   = (r->>'review_year')::int
      AND COALESCE(okv.department_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(NULLIF(r->>'department_id','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(okv.employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(NULLIF(r->>'employee_id','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.org_kpi_values
      SET
        achieved_value = NULLIF(r->>'achieved_value','')::numeric,
        data_source    = COALESCE(r->>'data_source', data_source),
        remarks        = CASE WHEN r ? 'remarks' THEN r->>'remarks' ELSE remarks END,
        entered_by     = NULLIF(r->>'entered_by','')::uuid,
        target_value   = NULLIF(r->>'target_value','')::numeric,
        r5             = COALESCE(r->>'r5', r5),
        r4             = COALESCE(r->>'r4', r4),
        r3             = COALESCE(r->>'r3', r3),
        r2             = COALESCE(r->>'r2', r2),
        r1             = COALESCE(r->>'r1', r1),
        r0             = COALESCE(r->>'r0', r0),
        criteria       = COALESCE(r->>'criteria', criteria),
        evidence_url   = CASE WHEN r ? 'evidence_url' THEN r->>'evidence_url' ELSE evidence_url END,
        is_na          = COALESCE((r->>'is_na')::boolean, is_na),
        sub_factors    = CASE WHEN r ? 'sub_factors' THEN r->'sub_factors' ELSE sub_factors END
      WHERE org_kpi_values.id = v_existing_id
      RETURNING org_kpi_values.id INTO v_id;

      IF v_id IS NOT NULL THEN
        id := v_id; was_insert := false; RETURN NEXT;
      END IF;
    ELSE
      BEGIN
        INSERT INTO public.org_kpi_values (
          category_id, kra_name, kpi_name, review_period, review_year,
          achieved_value, data_source, remarks, entered_by,
          department_id, employee_id, target_value,
          r5, r4, r3, r2, r1, r0, criteria, evidence_url, is_na, sub_factors
        )
        VALUES (
          (r->>'category_id')::uuid,
          (r->>'kra_name'),
          (r->>'kpi_name'),
          (r->>'review_period'),
          (r->>'review_year')::int,
          NULLIF(r->>'achieved_value','')::numeric,
          r->>'data_source',
          r->>'remarks',
          NULLIF(r->>'entered_by','')::uuid,
          NULLIF(r->>'department_id','')::uuid,
          NULLIF(r->>'employee_id','')::uuid,
          NULLIF(r->>'target_value','')::numeric,
          r->>'r5', r->>'r4', r->>'r3', r->>'r2', r->>'r1', r->>'r0',
          r->>'criteria',
          r->>'evidence_url',
          COALESCE((r->>'is_na')::boolean, false),
          CASE WHEN r ? 'sub_factors' THEN r->'sub_factors' ELSE NULL END
        )
        RETURNING org_kpi_values.id INTO v_id;

        id := v_id; was_insert := true; RETURN NEXT;
      EXCEPTION WHEN unique_violation THEN
        -- Race: another tx inserted between SELECT and INSERT. Retry as UPDATE.
        UPDATE public.org_kpi_values okv
        SET
          achieved_value = NULLIF(r->>'achieved_value','')::numeric,
          remarks        = CASE WHEN r ? 'remarks' THEN r->>'remarks' ELSE okv.remarks END,
          entered_by     = NULLIF(r->>'entered_by','')::uuid,
          evidence_url   = CASE WHEN r ? 'evidence_url' THEN r->>'evidence_url' ELSE okv.evidence_url END,
          is_na          = COALESCE((r->>'is_na')::boolean, okv.is_na),
          sub_factors    = CASE WHEN r ? 'sub_factors' THEN r->'sub_factors' ELSE okv.sub_factors END
        WHERE okv.category_id   = (r->>'category_id')::uuid
          AND okv.kra_name      = (r->>'kra_name')
          AND okv.kpi_name      = (r->>'kpi_name')
          AND okv.review_period = (r->>'review_period')
          AND okv.review_year   = (r->>'review_year')::int
          AND COALESCE(okv.department_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(NULLIF(r->>'department_id','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(okv.employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(NULLIF(r->>'employee_id','')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        RETURNING okv.id INTO v_id;

        IF v_id IS NOT NULL THEN
          id := v_id; was_insert := false; RETURN NEXT;
        END IF;
      END;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_org_kpi_values(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_org_kpi_values(jsonb) TO service_role;

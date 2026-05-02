-- 1) Extend allowed action_type list
ALTER TABLE public.kpi_standardization_actions
  DROP CONSTRAINT IF EXISTS kpi_standardization_actions_action_type_check;

ALTER TABLE public.kpi_standardization_actions
  ADD CONSTRAINT kpi_standardization_actions_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'create_definition'::text,
    'link_alias'::text,
    'rename_kpis'::text,
    'delete_definition'::text,
    'edit_definition'::text,
    'unlink_alias'::text,
    'skip_group'::text,
    'unskip_group'::text,
    'backfill_definition_links'::text
  ]));

-- 2) Retroactive backfill — May 2026+ only
DO $$
DECLARE
  v_canonical_count integer := 0;
  v_alias_count integer := 0;
  v_total integer := 0;
BEGIN
  WITH updated AS (
    UPDATE public.kpis k
    SET kpi_definition_id = d.id
    FROM public.kpi_definitions d
    WHERE k.kpi_definition_id IS NULL
      AND k.category_id = d.category_id
      AND LOWER(TRIM(k.kra_name)) = LOWER(TRIM(d.canonical_kra_name))
      AND LOWER(TRIM(k.kpi_name)) = LOWER(TRIM(d.canonical_kpi_name))
      AND (
        k.review_year > 2026
        OR (k.review_year = 2026 AND k.review_period IN
            ('May','June','July','August','September','October','November','December'))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_canonical_count FROM updated;

  WITH updated AS (
    UPDATE public.kpis k
    SET kpi_definition_id = a.definition_id
    FROM public.kpi_name_aliases a
    WHERE k.kpi_definition_id IS NULL
      AND k.category_id = a.category_id
      AND LOWER(TRIM(k.kra_name)) = LOWER(TRIM(a.variant_kra_name))
      AND LOWER(TRIM(k.kpi_name)) = LOWER(TRIM(a.variant_kpi_name))
      AND (
        k.review_year > 2026
        OR (k.review_year = 2026 AND k.review_period IN
            ('May','June','July','August','September','October','November','December'))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_alias_count FROM updated;

  v_total := v_canonical_count + v_alias_count;

  INSERT INTO public.kpi_standardization_actions
    (action_type, performed_by, payload, affected_row_count)
  VALUES (
    'backfill_definition_links',
    NULL,
    jsonb_build_object(
      'matched_via_canonical', v_canonical_count,
      'matched_via_alias', v_alias_count,
      'cutoff', 'May 2026+',
      'note', 'One-shot retroactive link of unlinked May-2026+ KPI rows to existing canonical definitions.'
    ),
    v_total
  );

  RAISE NOTICE 'KPI definition backfill complete: % via canonical, % via alias (total %)',
    v_canonical_count, v_alias_count, v_total;
END $$;
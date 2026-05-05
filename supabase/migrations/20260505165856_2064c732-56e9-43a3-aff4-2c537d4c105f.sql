-- 1. Helper function for canonical text normalization
CREATE OR REPLACE FUNCTION public.normalize_kpi_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p, ''), E'[\\s\\r\\n]+', ' ', 'g')));
$$;

-- 2. Reconcile org_kpi_data_owners text to canonical kpi text
DO $$
DECLARE
  v_owner RECORD;
  v_canon_kra text;
  v_canon_kpi text;
  v_total_fixed INT := 0;
BEGIN
  FOR v_owner IN
    SELECT o.id, o.category_id, o.kra_name, o.kpi_name
    FROM public.org_kpi_data_owners o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.kpis k
      WHERE k.is_org_level = true
        AND k.category_id = o.category_id
        AND k.kra_name = o.kra_name
        AND k.kpi_name = o.kpi_name
    )
  LOOP
    SELECT k.kra_name, k.kpi_name
      INTO v_canon_kra, v_canon_kpi
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.category_id = v_owner.category_id
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_owner.kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_owner.kpi_name)
    LIMIT 1;

    IF v_canon_kra IS NOT NULL THEN
      UPDATE public.org_kpi_data_owners
         SET kra_name = v_canon_kra,
             kpi_name = v_canon_kpi
       WHERE id = v_owner.id;
      v_total_fixed := v_total_fixed + 1;
    END IF;
    v_canon_kra := NULL; v_canon_kpi := NULL;
  END LOOP;
  RAISE NOTICE 'org_kpi_data_owners: reconciled % rows', v_total_fixed;
END $$;

-- 3. Reconcile org_kpi_values text to canonical kpi text
DO $$
DECLARE
  v_val RECORD;
  v_canon_kra text;
  v_canon_kpi text;
  v_total_fixed INT := 0;
  v_total_dropped INT := 0;
BEGIN
  FOR v_val IN
    SELECT v.id, v.category_id, v.kra_name, v.kpi_name
    FROM public.org_kpi_values v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.kpis k
      WHERE k.is_org_level = true
        AND k.category_id = v.category_id
        AND k.kra_name = v.kra_name
        AND k.kpi_name = v.kpi_name
    )
  LOOP
    SELECT k.kra_name, k.kpi_name
      INTO v_canon_kra, v_canon_kpi
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.category_id = v_val.category_id
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_val.kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_val.kpi_name)
    LIMIT 1;

    IF v_canon_kra IS NOT NULL THEN
      BEGIN
        UPDATE public.org_kpi_values
           SET kra_name = v_canon_kra,
               kpi_name = v_canon_kpi
         WHERE id = v_val.id;
        v_total_fixed := v_total_fixed + 1;
      EXCEPTION WHEN unique_violation THEN
        DELETE FROM public.org_kpi_values WHERE id = v_val.id;
        v_total_dropped := v_total_dropped + 1;
      END;
    END IF;
    v_canon_kra := NULL; v_canon_kpi := NULL;
  END LOOP;
  RAISE NOTICE 'org_kpi_values: reconciled % rows, dropped % duplicate variants', v_total_fixed, v_total_dropped;
END $$;
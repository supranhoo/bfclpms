
CREATE OR REPLACE FUNCTION public.normalize_kpi_text_value(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN txt IS NULL THEN NULL
    ELSE rtrim(regexp_replace(regexp_replace(txt, E'\\r\\n', E'\\n', 'g'), E'\\r', E'\\n', 'g'))
  END
$$;

CREATE OR REPLACE FUNCTION public.tg_normalize_kpi_text()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.kpi_name := public.normalize_kpi_text_value(NEW.kpi_name);
  NEW.kra_name := public.normalize_kpi_text_value(NEW.kra_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_kpi_text ON public.kpis;
CREATE TRIGGER trg_normalize_kpi_text
BEFORE INSERT OR UPDATE OF kpi_name, kra_name ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_kpi_text();

DROP TRIGGER IF EXISTS trg_normalize_kpi_text ON public.org_kpi_values;
CREATE TRIGGER trg_normalize_kpi_text
BEFORE INSERT OR UPDATE OF kpi_name, kra_name ON public.org_kpi_values
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_kpi_text();

-- One-shot retroactive normalization (bypass user triggers like prevent_locked_period_updates)
SET LOCAL session_replication_role = replica;

UPDATE public.kpis
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE kpi_name LIKE '%' || chr(13) || '%'
    OR kra_name LIKE '%' || chr(13) || '%';

UPDATE public.org_kpi_values
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE kpi_name LIKE '%' || chr(13) || '%'
    OR kra_name LIKE '%' || chr(13) || '%';

SET LOCAL session_replication_role = origin;

-- Re-trigger propagation for the two stuck April 2026 OKV rows
DO $$
DECLARE v_okv_id uuid;
BEGIN
  FOR v_okv_id IN
    SELECT id FROM public.org_kpi_values
     WHERE id IN ('14a4415f-19f9-45cc-9e08-3d53ab7f75b1'::uuid,
                  '08cb3564-d3f1-43c7-8bf4-f2573b39e5d1'::uuid)
  LOOP
    BEGIN
      PERFORM public.propagate_org_kpi_value(v_okv_id);
    EXCEPTION WHEN undefined_function THEN
      BEGIN
        PERFORM public.propagate_org_kpi_value_to_employees(v_okv_id);
      EXCEPTION WHEN undefined_function THEN NULL;
      END;
    END;
  END LOOP;
END $$;

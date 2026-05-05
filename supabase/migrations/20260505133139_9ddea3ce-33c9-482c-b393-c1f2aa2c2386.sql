-- 1. Delete CRLF org_kpi_data_owners rows whose cleaned key collides with an existing clean row
DELETE FROM public.org_kpi_data_owners a
USING public.org_kpi_data_owners b
WHERE (a.kpi_name LIKE '%' || E'\r' || '%' OR a.kra_name LIKE '%' || E'\r' || '%')
  AND a.id <> b.id
  AND a.category_id = b.category_id
  AND a.owner_id    = b.owner_id
  AND replace(a.kpi_name, E'\r', '') = replace(b.kpi_name, E'\r', '')
  AND replace(a.kra_name, E'\r', '') = replace(b.kra_name, E'\r', '')
  AND b.kpi_name NOT LIKE '%' || E'\r' || '%'
  AND b.kra_name NOT LIKE '%' || E'\r' || '%';

-- 2. Now safe to normalize remaining
UPDATE public.org_kpi_data_owners
SET kpi_name = replace(kpi_name, E'\r', ''),
    kra_name = replace(kra_name, E'\r', '')
WHERE kpi_name LIKE '%' || E'\r' || '%' OR kra_name LIKE '%' || E'\r' || '%';

-- 3. Same for kpis table (skip if it would cause unique conflict — leave to manual review)
DO $$
BEGIN
  BEGIN
    UPDATE public.kpis
    SET kpi_name = replace(kpi_name, E'\r', ''),
        kra_name = replace(kra_name, E'\r', '')
    WHERE kpi_name LIKE '%' || E'\r' || '%' OR kra_name LIKE '%' || E'\r' || '%';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Skipped kpis cleanup due to unique conflict; manual dedup needed';
  END;
END $$;

-- 4. Guard trigger
CREATE OR REPLACE FUNCTION public.strip_cr_from_kpi_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kpi_name IS NOT NULL THEN
    NEW.kpi_name := replace(NEW.kpi_name, E'\r', '');
  END IF;
  IF NEW.kra_name IS NOT NULL THEN
    NEW.kra_name := replace(NEW.kra_name, E'\r', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_strip_cr_kpi_text ON public.org_kpi_data_owners;
CREATE TRIGGER trg_strip_cr_kpi_text
BEFORE INSERT OR UPDATE ON public.org_kpi_data_owners
FOR EACH ROW EXECUTE FUNCTION public.strip_cr_from_kpi_text();

DROP TRIGGER IF EXISTS trg_strip_cr_kpi_text ON public.kpis;
CREATE TRIGGER trg_strip_cr_kpi_text
BEFORE INSERT OR UPDATE ON public.kpis
FOR EACH ROW EXECUTE FUNCTION public.strip_cr_from_kpi_text();
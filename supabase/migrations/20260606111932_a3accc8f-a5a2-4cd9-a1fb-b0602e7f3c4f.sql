-- Backup
CREATE TABLE IF NOT EXISTS public.org_kpi_owner_key_backup_2026_06 AS
SELECT *, now() AS backed_up_at FROM public.org_kpi_data_owners;

GRANT SELECT ON public.org_kpi_owner_key_backup_2026_06 TO authenticated;
GRANT ALL ON public.org_kpi_owner_key_backup_2026_06 TO service_role;
ALTER TABLE public.org_kpi_owner_key_backup_2026_06 ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.org_kpi_owner_key_backup_2026_06'::regclass
      AND polname = 'Admins can read owner key backup 2026-06'
  ) THEN
    CREATE POLICY "Admins can read owner key backup 2026-06"
      ON public.org_kpi_owner_key_backup_2026_06
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Step 1: delete non-canonical duplicates where a canonical equivalent already exists
-- for the SAME (category, owner) and same whitespace-normalized text.
DELETE FROM public.org_kpi_data_owners dup
USING public.org_kpi_data_owners canon,
      public.kpis k
WHERE dup.id <> canon.id
  AND dup.category_id = canon.category_id
  AND dup.owner_id    = canon.owner_id
  AND k.category_id   = dup.category_id
  AND canon.kra_name  = k.kra_name
  AND canon.kpi_name  = k.kpi_name
  AND regexp_replace(dup.kra_name,'[[:space:]]+',' ','g') = regexp_replace(k.kra_name,'[[:space:]]+',' ','g')
  AND regexp_replace(dup.kpi_name,'[[:space:]]+',' ','g') = regexp_replace(k.kpi_name,'[[:space:]]+',' ','g')
  AND (dup.kra_name <> k.kra_name OR dup.kpi_name <> k.kpi_name);

-- Step 2: canonicalize remaining mismatched rows.
WITH canonical AS (
  SELECT DISTINCT ON (o.id)
    o.id,
    k.kra_name AS canonical_kra,
    k.kpi_name AS canonical_kpi
  FROM public.org_kpi_data_owners o
  JOIN public.kpis k
    ON k.category_id = o.category_id
   AND regexp_replace(k.kra_name,'[[:space:]]+',' ','g') = regexp_replace(o.kra_name,'[[:space:]]+',' ','g')
   AND regexp_replace(k.kpi_name,'[[:space:]]+',' ','g') = regexp_replace(o.kpi_name,'[[:space:]]+',' ','g')
  WHERE k.kra_name <> o.kra_name OR k.kpi_name <> o.kpi_name
  ORDER BY o.id, k.created_at DESC NULLS LAST
)
UPDATE public.org_kpi_data_owners o
SET kra_name = c.canonical_kra,
    kpi_name = c.canonical_kpi
FROM canonical c
WHERE o.id = c.id;

DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM public.org_kpi_data_owners o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.category_id = o.category_id
      AND k.kra_name = o.kra_name
      AND k.kpi_name = o.kpi_name
  );
  RAISE NOTICE 'org_kpi_data_owners orphan rows after canonicalization: %', remaining;
END $$;
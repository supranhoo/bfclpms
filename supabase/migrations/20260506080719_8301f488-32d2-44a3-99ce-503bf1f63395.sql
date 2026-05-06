-- 1. Reversible backup table
CREATE TABLE IF NOT EXISTS public.org_kpi_owner_key_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_row_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  category_id uuid NOT NULL,
  old_kra_name text NOT NULL,
  old_kpi_name text NOT NULL,
  new_kra_name text NOT NULL,
  new_kpi_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('updated', 'deleted_duplicate')),
  reason text NOT NULL DEFAULT 'normalize-whitespace-cr',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_kpi_owner_key_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read owner key backup" ON public.org_kpi_owner_key_backup;
CREATE POLICY "Admins can read owner key backup"
  ON public.org_kpi_owner_key_backup
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Compute normalised text once
WITH norm AS (
  SELECT
    o.id,
    o.owner_id,
    o.category_id,
    o.kra_name AS old_kra,
    o.kpi_name AS old_kpi,
    btrim(regexp_replace(replace(o.kra_name, E'\r', ''), '\s+', ' ', 'g')) AS new_kra,
    btrim(regexp_replace(replace(o.kpi_name, E'\r', ''), '\s+', ' ', 'g')) AS new_kpi,
    o.created_at
  FROM public.org_kpi_data_owners o
),
ranked AS (
  SELECT n.*,
         row_number() OVER (
           PARTITION BY n.owner_id, n.category_id, n.new_kra, n.new_kpi
           ORDER BY n.created_at ASC, n.id ASC
         ) AS rn
  FROM norm n
),
-- Rows that will be deleted as duplicates (rn > 1)
to_delete AS (
  SELECT id, owner_id, category_id, old_kra, old_kpi, new_kra, new_kpi
  FROM ranked WHERE rn > 1
),
-- Rows that survive AND need a text update (rn = 1 AND text actually changes)
to_update AS (
  SELECT id, owner_id, category_id, old_kra, old_kpi, new_kra, new_kpi
  FROM ranked
  WHERE rn = 1 AND (new_kra <> old_kra OR new_kpi <> old_kpi)
),
backup_del AS (
  INSERT INTO public.org_kpi_owner_key_backup
    (owner_row_id, owner_id, category_id, old_kra_name, old_kpi_name, new_kra_name, new_kpi_name, action)
  SELECT id, owner_id, category_id, old_kra, old_kpi, new_kra, new_kpi, 'deleted_duplicate'
  FROM to_delete
  RETURNING 1
),
backup_upd AS (
  INSERT INTO public.org_kpi_owner_key_backup
    (owner_row_id, owner_id, category_id, old_kra_name, old_kpi_name, new_kra_name, new_kpi_name, action)
  SELECT id, owner_id, category_id, old_kra, old_kpi, new_kra, new_kpi, 'updated'
  FROM to_update
  RETURNING 1
),
deletes AS (
  DELETE FROM public.org_kpi_data_owners
  WHERE id IN (SELECT id FROM to_delete)
  RETURNING 1
)
UPDATE public.org_kpi_data_owners o
SET kra_name = u.new_kra,
    kpi_name = u.new_kpi
FROM to_update u
WHERE o.id = u.id;
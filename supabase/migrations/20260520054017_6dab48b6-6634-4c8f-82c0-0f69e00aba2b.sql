
-- Denylist for tables intentionally excluded from automated backups.
CREATE TABLE IF NOT EXISTS public.backup_denylist (
  table_name text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.backup_denylist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read backup denylist"
  ON public.backup_denylist FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage backup denylist"
  ON public.backup_denylist FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Topologically sorted public tables (parents first). Falls back to
-- alphabetical for tables not connected to any FK graph.
CREATE OR REPLACE FUNCTION public.get_backup_table_order()
RETURNS TABLE(table_name text, sort_rank integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_changed boolean;
  v_iter integer := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _bk_tables (
    tname text PRIMARY KEY,
    depth integer
  ) ON COMMIT DROP;
  TRUNCATE _bk_tables;

  INSERT INTO _bk_tables(tname, depth)
  SELECT t.table_name, 0
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT IN (SELECT bd.table_name FROM public.backup_denylist bd);

  -- Iteratively push children deeper than their parents.
  LOOP
    v_iter := v_iter + 1;
    v_changed := false;

    WITH fk AS (
      SELECT
        c.conrelid::regclass::text AS child,
        c.confrelid::regclass::text AS parent
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND c.conrelid <> c.confrelid
    ),
    bumped AS (
      SELECT
        regexp_replace(fk.child, '^public\.', '') AS child_t,
        regexp_replace(fk.parent, '^public\.', '') AS parent_t,
        cp.depth AS parent_depth,
        cc.depth AS child_depth
      FROM fk
      JOIN _bk_tables cc ON cc.tname = regexp_replace(fk.child, '^public\.', '')
      JOIN _bk_tables cp ON cp.tname = regexp_replace(fk.parent, '^public\.', '')
    )
    UPDATE _bk_tables b
    SET depth = sub.new_depth
    FROM (
      SELECT child_t, MAX(parent_depth) + 1 AS new_depth
      FROM bumped
      WHERE child_depth <= parent_depth
      GROUP BY child_t
    ) sub
    WHERE b.tname = sub.child_t
      AND b.depth < sub.new_depth;

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0 OR v_iter > 50;
  END LOOP;

  RETURN QUERY
    SELECT b.tname, ROW_NUMBER() OVER (ORDER BY b.depth ASC, b.tname ASC)::int
    FROM _bk_tables b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_backup_table_order() TO authenticated, service_role;

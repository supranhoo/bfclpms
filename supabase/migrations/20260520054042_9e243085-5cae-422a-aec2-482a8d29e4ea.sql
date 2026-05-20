
CREATE OR REPLACE FUNCTION public.get_backup_table_order()
RETURNS TABLE(table_name text, sort_rank integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_iter integer := 0;
  v_changed integer;
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

  LOOP
    v_iter := v_iter + 1;

    WITH fk AS (
      SELECT
        regexp_replace(c.conrelid::regclass::text, '^public\.', '') AS child_t,
        regexp_replace(c.confrelid::regclass::text, '^public\.', '') AS parent_t
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND c.conrelid <> c.confrelid
    ),
    bumped AS (
      SELECT fk.child_t, MAX(cp.depth) + 1 AS new_depth
      FROM fk
      JOIN _bk_tables cc ON cc.tname = fk.child_t
      JOIN _bk_tables cp ON cp.tname = fk.parent_t
      WHERE cc.depth <= cp.depth
      GROUP BY fk.child_t
    )
    UPDATE _bk_tables b
    SET depth = bumped.new_depth
    FROM bumped
    WHERE b.tname = bumped.child_t;

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0 OR v_iter > 50;
  END LOOP;

  RETURN QUERY
    SELECT b.tname, ROW_NUMBER() OVER (ORDER BY b.depth ASC, b.tname ASC)::int
    FROM _bk_tables b;
END;
$$;

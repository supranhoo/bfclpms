-- Action-aware menu write gate. Explicit per-user overrides remain full grants
-- (they are admin-issued, all-or-nothing rows); profile-based rights must now
-- carry the matching add/update/delete flag instead of only 'view'.
CREATE OR REPLACE FUNCTION public.has_menu_write_access(_user_id uuid, _menu_key text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.menu_access_user_overrides
      WHERE user_id = _user_id AND menu_key = _menu_key
    )
    OR public.has_profile_menu_access(_user_id, _menu_key, _action);
$function$;

DO $do$
DECLARE
  r record;
  v_roles text;
  v_qual text;
  v_check text;
  v_act text;
  v_cmds text[];
  c text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd <> 'SELECT'
      AND (coalesce(qual,'') LIKE '%has_menu_access_override%'
        OR coalesce(with_check,'') LIKE '%has_menu_access_override%')
  LOOP
    v_roles := array_to_string(r.roles, ', ');
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'ALL' THEN
      -- Preserve read access unchanged, then re-issue action-scoped writes.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS %s FOR SELECT TO %s USING (%s)',
        r.policyname || ' (read)', r.tablename,
        CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        v_roles, coalesce(r.qual, 'true'));
      v_cmds := ARRAY['INSERT','UPDATE','DELETE'];
    ELSE
      v_cmds := ARRAY[r.cmd];
    END IF;

    FOREACH c IN ARRAY v_cmds LOOP
      v_act := CASE c WHEN 'INSERT' THEN 'add' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END;
      v_qual := regexp_replace(coalesce(r.qual, ''),
        'has_menu_access_override\(([^()]*)\)',
        'has_menu_write_access(\1, ''' || v_act || ''')', 'g');
      v_check := regexp_replace(coalesce(r.with_check, ''),
        'has_menu_access_override\(([^()]*)\)',
        'has_menu_write_access(\1, ''' || v_act || ''')', 'g');

      IF c = 'INSERT' THEN
        IF v_check = '' THEN v_check := coalesce(nullif(v_qual,''), 'true'); END IF;
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO %s WITH CHECK (%s)',
          CASE WHEN r.cmd = 'ALL' THEN r.policyname || ' (insert)' ELSE r.policyname END,
          r.tablename, v_roles, v_check);
      ELSIF c = 'UPDATE' THEN
        IF v_qual = '' THEN v_qual := 'true'; END IF;
        IF v_check = '' THEN v_check := v_qual; END IF;
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
          CASE WHEN r.cmd = 'ALL' THEN r.policyname || ' (update)' ELSE r.policyname END,
          r.tablename, v_roles, v_qual, v_check);
      ELSE
        IF v_qual = '' THEN v_qual := 'true'; END IF;
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO %s USING (%s)',
          CASE WHEN r.cmd = 'ALL' THEN r.policyname || ' (delete)' ELSE r.policyname END,
          r.tablename, v_roles, v_qual);
      END IF;
    END LOOP;
  END LOOP;
END
$do$;
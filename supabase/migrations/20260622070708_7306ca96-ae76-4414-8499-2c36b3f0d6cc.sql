DO $$
DECLARE
  r RECORD;
  allowlist TEXT[] := ARRAY['get_public_branding','lookup_synthetic_email_by_code','get_public_registry_view'];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF NOT (r.proname = ANY(allowlist)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;
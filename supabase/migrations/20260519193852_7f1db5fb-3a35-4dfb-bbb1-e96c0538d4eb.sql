-- Safety backup→restore drill sandbox
CREATE SCHEMA IF NOT EXISTS safety_drill;

-- Mirror the 3 tables we want to verify (structure only; no FKs/policies)
CREATE TABLE IF NOT EXISTS safety_drill.safety_incidents (LIKE public.safety_incidents INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS safety_drill.safety_permits    (LIKE public.safety_permits    INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TABLE IF NOT EXISTS safety_drill.safety_audit_runs (LIKE public.safety_audit_runs INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

-- Lock sandbox down: only service_role
REVOKE ALL ON SCHEMA safety_drill FROM PUBLIC, anon, authenticated;
GRANT  USAGE ON SCHEMA safety_drill TO service_role;
GRANT  ALL   ON ALL TABLES IN SCHEMA safety_drill TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA safety_drill GRANT ALL ON TABLES TO service_role;

-- Seed: copy up to 5 rows of each live table into the sandbox.
-- Admin (PMS) or any safety role with 'admin'/'safety_head' may invoke.
CREATE OR REPLACE FUNCTION public.safety_drill_seed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, safety_drill
AS $$
DECLARE
  v_incidents int;
  v_permits   int;
  v_audits    int;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_seed: not authorized';
  END IF;

  TRUNCATE safety_drill.safety_incidents, safety_drill.safety_permits, safety_drill.safety_audit_runs;

  INSERT INTO safety_drill.safety_incidents
    SELECT * FROM public.safety_incidents ORDER BY created_at DESC NULLS LAST LIMIT 5;
  GET DIAGNOSTICS v_incidents = ROW_COUNT;

  INSERT INTO safety_drill.safety_permits
    SELECT * FROM public.safety_permits ORDER BY created_at DESC NULLS LAST LIMIT 5;
  GET DIAGNOSTICS v_permits = ROW_COUNT;

  INSERT INTO safety_drill.safety_audit_runs
    SELECT * FROM public.safety_audit_runs ORDER BY created_at DESC NULLS LAST LIMIT 5;
  GET DIAGNOSTICS v_audits = ROW_COUNT;

  RETURN jsonb_build_object(
    'safety_incidents', v_incidents,
    'safety_permits',   v_permits,
    'safety_audit_runs', v_audits
  );
END;
$$;

-- Counts helper for verify phase
CREATE OR REPLACE FUNCTION public.safety_drill_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, safety_drill
AS $$
DECLARE
  v_incidents int;
  v_permits   int;
  v_audits    int;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_counts: not authorized';
  END IF;

  SELECT count(*) INTO v_incidents FROM safety_drill.safety_incidents;
  SELECT count(*) INTO v_permits   FROM safety_drill.safety_permits;
  SELECT count(*) INTO v_audits    FROM safety_drill.safety_audit_runs;

  RETURN jsonb_build_object(
    'safety_incidents', v_incidents,
    'safety_permits',   v_permits,
    'safety_audit_runs', v_audits
  );
END;
$$;

-- Wipe sandbox tables (used between drill runs)
CREATE OR REPLACE FUNCTION public.safety_drill_truncate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, safety_drill
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_truncate: not authorized';
  END IF;

  TRUNCATE safety_drill.safety_incidents, safety_drill.safety_permits, safety_drill.safety_audit_runs;
END;
$$;

REVOKE ALL ON FUNCTION public.safety_drill_seed()      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_drill_counts()    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_drill_truncate()  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.safety_drill_seed()     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.safety_drill_counts()   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.safety_drill_truncate() TO authenticated;
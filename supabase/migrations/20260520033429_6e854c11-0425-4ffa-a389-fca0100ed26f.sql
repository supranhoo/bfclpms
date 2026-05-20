-- 1) Drill run history table
CREATE TABLE IF NOT EXISTS public.safety_drill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id uuid NOT NULL,
  backup_id uuid NULL,
  ok boolean NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  after jsonb NOT NULL DEFAULT '{}'::jsonb,
  deltas jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NULL,
  performed_by uuid NULL,
  system_run boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_drill_runs_finished_at
  ON public.safety_drill_runs (finished_at DESC);

ALTER TABLE public.safety_drill_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_drill_runs admin/safety_head select" ON public.safety_drill_runs;
CREATE POLICY "safety_drill_runs admin/safety_head select"
ON public.safety_drill_runs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
  OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
);

-- 2) Drop functions whose signatures/return types are being adjusted
DROP FUNCTION IF EXISTS public.safety_drill_load(text, jsonb);

-- 3) Recreate the 5 safety_drill_* helpers, also allowing service_role
CREATE OR REPLACE FUNCTION public.safety_drill_seed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'safety_drill'
AS $function$
DECLARE
  v_incidents int;
  v_permits   int;
  v_audits    int;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
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
$function$;

CREATE OR REPLACE FUNCTION public.safety_drill_dump(_table text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'safety_drill'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_dump: not authorized';
  END IF;

  IF _table NOT IN ('safety_incidents','safety_permits','safety_audit_runs') THEN
    RAISE EXCEPTION 'safety_drill_dump: invalid table %', _table;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM safety_drill.%I t',
    _table
  ) INTO v_rows;

  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.safety_drill_truncate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'safety_drill'
AS $function$
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_truncate: not authorized';
  END IF;

  TRUNCATE safety_drill.safety_incidents, safety_drill.safety_permits, safety_drill.safety_audit_runs;
END;
$function$;

CREATE OR REPLACE FUNCTION public.safety_drill_load(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'safety_drill'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  ) THEN
    RAISE EXCEPTION 'safety_drill_load: not authorized';
  END IF;

  IF _table NOT IN ('safety_incidents','safety_permits','safety_audit_runs') THEN
    RAISE EXCEPTION 'safety_drill_load: invalid table %', _table;
  END IF;

  EXECUTE format(
    'INSERT INTO safety_drill.%I SELECT * FROM jsonb_populate_recordset(NULL::safety_drill.%I, $1)',
    _table, _table
  ) USING _rows;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.safety_drill_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'safety_drill'
AS $function$
DECLARE
  v_incidents int;
  v_permits   int;
  v_audits    int;
BEGIN
  IF NOT (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
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
$function$;
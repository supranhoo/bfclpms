-- ADR-285 — Performance Console: Management & Audit may act once a KPI has left KRA Set.
CREATE OR REPLACE FUNCTION public.bu_console_can_write(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid,'admin')
      OR public.has_role(_uid,'management')
      OR public.has_role(_uid,'auditor');
$function$;

COMMENT ON FUNCTION public.bu_console_can_write(uuid) IS
  'ADR-285 / POLICY CONSOLE-ACCESS-TIERS - who may write from the Performance Console. hr_pms is read-only.';

CREATE OR REPLACE FUNCTION public.bu_console_kpi_actionable(_uid uuid, _kpi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(_uid,'admin') THEN true
    WHEN NOT public.bu_console_can_write(_uid) THEN false
    ELSE EXISTS (SELECT 1 FROM public.kpis k WHERE k.id = _kpi_id AND k.status::text <> 'kra_set')
  END;
$function$;

COMMENT ON FUNCTION public.bu_console_kpi_actionable(uuid, uuid) IS
  'ADR-285 - KPIs still in KRA Set are Admin-only; Management/Audit act from self review onwards.';

-- Re-gate the existing console write RPCs in place: fetch each definition,
-- swap the role gate, inject the KRA Set guard, re-execute. Every replacement
-- is asserted, so a drifted body aborts the migration instead of silently
-- leaving an admin-only gate behind.
DO $do$
DECLARE
  v_def text;
  v_new text;

  PROCEDURE_PLACEHOLDER text;
BEGIN
  -- 1. Plain gate swaps (v_user variant)
  FOREACH v_new IN ARRAY ARRAY[
    'bu_console_edit_runs_list','bu_console_undo_edit_run','bu_goal_upsert','bu_goal_archive'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_new;
    IF v_def IS NULL THEN RAISE EXCEPTION 'ADR-285: % not found', v_new; END IF;
    IF position('has_role(v_user, ''admin'')' in v_def) = 0 THEN
      RAISE EXCEPTION 'ADR-285: gate not found in %', v_new;
    END IF;
    EXECUTE replace(v_def, 'has_role(v_user, ''admin'')', 'bu_console_can_write(v_user)');
  END LOOP;

  -- 2. Merge proposals (auth.uid() variant)
  FOREACH v_new IN ARRAY ARRAY[
    'bu_console_decide_merge_proposal','bu_console_generate_merge_proposals'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_new;
    IF position('has_role(auth.uid(),''admin'')' in v_def) = 0 THEN
      RAISE EXCEPTION 'ADR-285: gate not found in %', v_new;
    END IF;
    EXECUTE replace(v_def, 'has_role(auth.uid(),''admin'')', 'bu_console_can_write(auth.uid())');
  END LOOP;

  -- 3. bu_console_clear_row_overrides — gate + per-KPI guard
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_clear_row_overrides';
  v_new := replace(v_def, 'has_role(v_user, ''admin'')', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '  DELETE FROM public.bu_console_kpi_overrides o',
    '  IF NOT public.bu_console_kpi_actionable(v_user, p_kpi_id) THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''authorized'', true, ''cleared'', 0, ''reason'', ''kra_set_admin_only'');' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  DELETE FROM public.bu_console_kpi_overrides o');
  IF v_new = v_def THEN RAISE EXCEPTION 'ADR-285: clear_row_overrides unchanged'; END IF;
  EXECUTE v_new;

  -- 4. bu_console_row_override — gate + per-KPI guard
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_row_override';
  v_new := replace(v_def, 'has_role(v_user, ''admin'')', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '  IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''authorized'', true, ''updated'', 0, ''reason'', ''final_score_locked'');' || chr(10) ||
    '  END IF;',
    '  IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''authorized'', true, ''updated'', 0, ''reason'', ''final_score_locked'');' || chr(10) ||
    '  END IF;' || chr(10) ||
    '  IF NOT public.bu_console_kpi_actionable(v_user, p_kpi_id) THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''authorized'', true, ''updated'', 0, ''reason'', ''kra_set_admin_only'');' || chr(10) ||
    '  END IF;');
  IF position('kra_set_admin_only' in v_new) = 0 THEN
    RAISE EXCEPTION 'ADR-285: row_override guard not injected';
  END IF;
  EXECUTE v_new;

  -- 5. bu_console_bulk_row_overrides — gate + per-row skip
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_bulk_row_overrides';
  v_new := replace(v_def, 'has_role(v_user, ''admin'')', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '    IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_skipped := v_skipped || jsonb_build_object(''kpi_id'', v_kpi_id, ''reason'', ''final_score_locked'');' || chr(10) ||
    '      CONTINUE;' || chr(10) ||
    '    END IF;',
    '    IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_skipped := v_skipped || jsonb_build_object(''kpi_id'', v_kpi_id, ''reason'', ''final_score_locked'');' || chr(10) ||
    '      CONTINUE;' || chr(10) ||
    '    END IF;' || chr(10) ||
    '    IF NOT public.bu_console_kpi_actionable(v_user, v_kpi_id) THEN' || chr(10) ||
    '      v_skipped := v_skipped || jsonb_build_object(''kpi_id'', v_kpi_id, ''reason'', ''kra_set_admin_only'');' || chr(10) ||
    '      CONTINUE;' || chr(10) ||
    '    END IF;');
  IF position('kra_set_admin_only' in v_new) = 0 THEN
    RAISE EXCEPTION 'ADR-285: bulk_row_overrides guard not injected';
  END IF;
  EXECUTE v_new;

  -- 6. bu_console_group_write — read gate becomes write gate + per-row reason
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_group_write';
  IF position('bu_console_can_read(v_user)' in v_def) = 0 THEN
    RAISE EXCEPTION 'ADR-285: group_write read gate not found';
  END IF;
  v_new := replace(v_def, 'bu_console_can_read(v_user)', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '  v_user uuid := auth.uid();',
    '  v_user uuid := auth.uid();' || chr(10) ||
    '  v_is_admin boolean := public.has_role(auth.uid(), ''admin'');');
  v_new := replace(v_new,
    '    IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_reason := ''final_score_locked'';' || chr(10) ||
    '    ELSIF',
    '    IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_reason := ''final_score_locked'';' || chr(10) ||
    '    ELSIF NOT v_is_admin AND v_rec.status::text = ''kra_set'' THEN' || chr(10) ||
    '      v_reason := ''kra_set_admin_only'';' || chr(10) ||
    '    ELSIF');
  IF position('kra_set_admin_only' in v_new) = 0 THEN
    RAISE EXCEPTION 'ADR-285: group_write guard not injected';
  END IF;
  EXECUTE v_new;

  -- 7. bu_console_group_advance — read gate becomes write gate + per-row reason
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_group_advance';
  IF position('bu_console_can_read(v_user)' in v_def) = 0 THEN
    RAISE EXCEPTION 'ADR-285: group_advance read gate not found';
  END IF;
  v_new := replace(v_def, 'bu_console_can_read(v_user)', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '  v_user uuid := auth.uid();',
    '  v_user uuid := auth.uid();' || chr(10) ||
    '  v_is_admin boolean := public.has_role(auth.uid(), ''admin'');');
  v_new := replace(v_new,
    '    IF v_reason IS NULL AND v_rec.final_score IS NOT NULL THEN',
    '    IF v_reason IS NULL AND NOT v_is_admin AND v_rec.status::text = ''kra_set'' THEN' || chr(10) ||
    '      v_reason := ''kra_set_admin_only'';' || chr(10) ||
    '    END IF;' || chr(10) || chr(10) ||
    '    IF v_reason IS NULL AND v_rec.final_score IS NOT NULL THEN');
  IF position('kra_set_admin_only' in v_new) = 0 THEN
    RAISE EXCEPTION 'ADR-285: group_advance guard not injected';
  END IF;
  EXECUTE v_new;

  -- 8. bu_console_group_edit_definition — gate + per-row reason
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='bu_console_group_edit_definition';
  v_new := replace(v_def, 'has_role(v_user, ''admin'')', 'bu_console_can_write(v_user)');
  v_new := replace(v_new,
    '  v_user uuid := auth.uid();',
    '  v_user uuid := auth.uid();' || chr(10) ||
    '  v_is_admin boolean := public.has_role(auth.uid(), ''admin'');');
  v_new := replace(v_new,
    '    IF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_reason := ''final_score_locked'';',
    '    IF NOT v_is_admin AND v_rec.status::text = ''kra_set'' THEN' || chr(10) ||
    '      v_reason := ''kra_set_admin_only'';' || chr(10) ||
    '    ELSIF v_rec.final_score IS NOT NULL THEN' || chr(10) ||
    '      v_reason := ''final_score_locked'';');
  IF position('kra_set_admin_only' in v_new) = 0 THEN
    RAISE EXCEPTION 'ADR-285: group_edit_definition guard not injected';
  END IF;
  EXECUTE v_new;
END;
$do$;
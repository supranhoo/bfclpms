-- Safety Phase 8 dead-column cleanup.
-- Pre-flight (re-asserted in-transaction): all rows at default, no dependents, no readers.

DO $$
DECLARE
  v_bad_ui   int;
  v_bad_copy int;
BEGIN
  SELECT count(*) INTO v_bad_ui
  FROM public.safety_settings
  WHERE ui_incident_v2 IS DISTINCT FROM false;

  SELECT count(*) INTO v_bad_copy
  FROM public.safety_settings
  WHERE incident_stage_copy IS DISTINCT FROM '{}'::jsonb;

  IF v_bad_ui > 0 OR v_bad_copy > 0 THEN
    RAISE EXCEPTION
      'ABORT Phase 8 dead-column cleanup: non-default data present (ui_incident_v2=%, incident_stage_copy=%)',
      v_bad_ui, v_bad_copy;
  END IF;
END $$;

-- Plain DROP COLUMN (no CASCADE). Fails loudly on any hidden dependent.
ALTER TABLE public.safety_settings DROP COLUMN ui_incident_v2;
ALTER TABLE public.safety_settings DROP COLUMN incident_stage_copy;
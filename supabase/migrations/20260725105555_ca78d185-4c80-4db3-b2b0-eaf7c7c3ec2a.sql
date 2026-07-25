DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_changed_count integer := 0;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('set_annual_review_enabled_stages', 'reassign_annual_review_reviewer')
       AND pg_get_function_identity_arguments(p.oid) IN (
         'p_instance_id uuid, p_enabled_stages jsonb, p_reason text, p_mode text',
         'p_instance_id uuid, p_role text, p_new_reviewer_id uuid, p_reason text, p_mode text'
       )
  LOOP
    v_definition := pg_get_functiondef(v_oid);

    IF position('pending_dept_head' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Expected stale Department Head status mapping was not found in function %', v_oid::regprocedure;
    END IF;

    v_definition := replace(v_definition, 'pending_dept_head', 'pending_dept');
    EXECUTE v_definition;
    v_changed_count := v_changed_count + 1;
  END LOOP;

  IF v_changed_count <> 2 THEN
    RAISE EXCEPTION 'Expected to correct 2 workflow functions, corrected %', v_changed_count;
  END IF;
END
$migration$;
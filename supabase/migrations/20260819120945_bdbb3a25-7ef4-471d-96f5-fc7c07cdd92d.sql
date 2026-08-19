DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'org_kpi_central_config','org_kpi_effective_chain','org_kpi_can_read_central',
        'org_kpi_step_actor_matches','org_kpi_chain_list','org_kpi_chain_upsert',
        'org_kpi_submit_value','org_kpi_decide','org_kpi_finalise')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.kpi_scope_options(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kpi_scope_population_summary(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.migrate_okv_scope_generic(uuid, text, text, text, integer, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_scope_options(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_scope_population_summary(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_okv_scope_generic(uuid, text, text, text, integer, text, text, uuid, uuid, uuid) TO authenticated, service_role;
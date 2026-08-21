
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_get(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_upsert_def(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_rows_read(uuid,integer,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_row_save(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_row_delete(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_bulk_import(uuid,jsonb,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_rollup(uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_validate(uuid,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_validation_state(uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_read_kpi_dataset_row(uuid, public.org_kpi_dataset_rows) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_write_kpi_dataset(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.employee_org_scope(uuid) TO service_role;

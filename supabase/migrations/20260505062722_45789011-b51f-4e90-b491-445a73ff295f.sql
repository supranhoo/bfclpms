
ALTER TABLE public.kpis DISABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values DISABLE TRIGGER USER;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER trg_normalize_kpi_text;

UPDATE public.kpis
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE kpi_name LIKE '%' || chr(13) || '%'
    OR kra_name LIKE '%' || chr(13) || '%';

UPDATE public.org_kpi_values
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE kpi_name LIKE '%' || chr(13) || '%'
    OR kra_name LIKE '%' || chr(13) || '%';

ALTER TABLE public.kpis ENABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER USER;

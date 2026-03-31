CREATE OR REPLACE FUNCTION public.notify_on_query_raised()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_kpi_name TEXT;
  v_raiser_name TEXT;
BEGIN
  SELECT LEFT(SPLIT_PART(COALESCE(kpi_name, ''), E'\n', 1), 80) INTO v_kpi_name
  FROM public.kpis WHERE id = NEW.kpi_id;

  SELECT COALESCE(full_name, email) INTO v_raiser_name
  FROM public.profiles WHERE id = NEW.raised_by;

  INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
  VALUES (
    NEW.raised_to,
    'query_raised',
    'New Query Raised',
    v_raiser_name || ' raised a query on "' || COALESCE(v_kpi_name, 'a KPI') || '": ' || LEFT(NEW.reason, 120),
    NEW.kpi_id,
    NEW.raised_by,
    jsonb_build_object('query_id', NEW.id, 'query_reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;
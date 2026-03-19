CREATE OR REPLACE FUNCTION public.get_template_linked_counts()
RETURNS TABLE(template_id uuid, linked_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT source_template_id, count(*)
  FROM kpis
  WHERE source_template_id IS NOT NULL
  GROUP BY source_template_id;
$$;
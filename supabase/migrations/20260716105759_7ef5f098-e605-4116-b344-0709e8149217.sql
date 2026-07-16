
WITH targets AS (
  SELECT ari.id
  FROM public.annual_review_instances ari
  JOIN public.annual_review_templates art
    ON art.id = COALESCE(ari.template_override_id, ari.template_id)
  WHERE art.is_active = true
    AND (art.name ILIKE '%- M -%' OR art.name ILIKE '% M Plant%' OR art.name ILIKE 'Generic M%')
    AND art.name NOT ILIKE '%- W -%'
    AND ari.overall_status NOT IN ('completed','excluded')
),
canonical AS (
  SELECT id,
    (
      SELECT jsonb_agg(s ORDER BY pos)
      FROM (VALUES
        ('self',1),('manager',2),('skip_manager',3),
        ('dept_head',4),('bu_head',5),('hr',6)
      ) v(s,pos)
    ) AS new_stages
  FROM targets
)
UPDATE public.annual_review_instances a
SET enabled_stages = c.new_stages,
    updated_at = now()
FROM canonical c
WHERE a.id = c.id
  AND a.enabled_stages IS DISTINCT FROM c.new_stages;

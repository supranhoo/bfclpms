
-- 1. Templates
WITH targets AS (
  SELECT id, sections, version
  FROM public.annual_review_templates
  WHERE is_active = true
    AND jsonb_typeof(sections->'criteria') = 'array'
),
rewritten AS (
  SELECT
    t.id,
    t.version,
    t.sections AS old_sections,
    jsonb_set(
      t.sections,
      '{criteria}',
      COALESCE((
        SELECT jsonb_agg(
          c || jsonb_build_object(
            'reviewer_stages', jsonb_build_array('self','dept_head','bu_head')
          )
        )
        FROM jsonb_array_elements(t.sections->'criteria') c
      ), '[]'::jsonb)
    ) AS new_sections
  FROM targets t
)
UPDATE public.annual_review_templates tpl
SET
  sections = r.new_sections,
  updated_at = now(),
  version = CASE WHEN r.old_sections IS DISTINCT FROM r.new_sections THEN tpl.version + 1 ELSE tpl.version END
FROM rewritten r
WHERE tpl.id = r.id
  AND r.old_sections IS DISTINCT FROM r.new_sections;

-- 2. Instances: set enabled_stages jsonb array
UPDATE public.annual_review_instances
SET
  enabled_stages = '["self","dept_head","bu_head"]'::jsonb,
  updated_at = now()
WHERE overall_status NOT IN ('completed','excluded')
  AND enabled_stages IS DISTINCT FROM '["self","dept_head","bu_head"]'::jsonb;

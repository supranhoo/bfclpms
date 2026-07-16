
WITH targets AS (
  SELECT id, sections
  FROM public.annual_review_templates
  WHERE is_active = true
    AND (name ILIKE '%- M -%' OR name ILIKE '% M Plant%' OR name ILIKE 'Generic M%' OR name ILIKE '% M -%')
    AND name NOT ILIKE '%- W -%'
),
rewritten AS (
  SELECT
    t.id,
    jsonb_set(
      t.sections,
      '{criteria}',
      COALESCE((
        SELECT jsonb_agg(
          (c - 'reviewer_stages' - 'enable_remarks' - 'enable_evidence' - 'evidence_required')
          || jsonb_build_object(
              'reviewer_stages', jsonb_build_array('self','manager','skip_manager','dept_head','bu_head','hr'),
              'enable_remarks', true,
              'enable_evidence', false,
              'evidence_required', false
             )
        )
        FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c
      ), '[]'::jsonb)
    ) AS new_sections
  FROM targets t
)
UPDATE public.annual_review_templates a
SET sections = r.new_sections,
    updated_at = now(),
    version = a.version + 1
FROM rewritten r
WHERE a.id = r.id
  AND a.sections IS DISTINCT FROM r.new_sections;

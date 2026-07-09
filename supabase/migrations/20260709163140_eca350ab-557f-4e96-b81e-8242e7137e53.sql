
UPDATE public.annual_review_system_kpis k
SET scoring_rules = jsonb_set(
      k.scoring_rules,
      '{bands}',
      (
        SELECT jsonb_agg(
                 CASE
                   WHEN jsonb_typeof(band->'threshold') <> 'number'
                     THEN jsonb_set(band, '{threshold}', to_jsonb(999))
                   ELSE band
                 END
                 ORDER BY ord
               )
          FROM jsonb_array_elements(k.scoring_rules->'bands') WITH ORDINALITY AS b(band, ord)
      ),
      false
    ),
    updated_at = now()
WHERE k.key IN ('lti_rate','sti_rate')
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements(k.scoring_rules->'bands') band
     WHERE jsonb_typeof(band->'threshold') <> 'number'
  );

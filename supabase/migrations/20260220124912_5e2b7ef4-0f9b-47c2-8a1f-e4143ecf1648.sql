
CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item jsonb;
  old_score numeric;
  result jsonb := '[]'::jsonb;
  propagated_count int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    -- Get old score
    SELECT self_score INTO old_score
    FROM review_submissions WHERE kpi_id = (item->>'kpi_id')::uuid;

    -- Upsert review_submission
    INSERT INTO review_submissions (kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role, updated_at)
    VALUES (
      (item->>'kpi_id')::uuid,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_rating')::text::rating_level END,
      p_is_na,
      CASE WHEN p_is_na THEN 'admin' ELSE NULL END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      updated_at = now();

    -- Advance status from kra_set to self_review
    UPDATE kpis SET status = 'self_review'
    WHERE id = (item->>'kpi_id')::uuid AND status = 'kra_set';

    propagated_count := propagated_count + 1;

    -- Build result detail
    result := result || jsonb_build_object(
      'kpi_id', item->>'kpi_id',
      'old_score', old_score,
      'new_score', CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END
    );
  END LOOP;

  RETURN jsonb_build_object('propagated_count', propagated_count, 'details', result);
END;
$$;

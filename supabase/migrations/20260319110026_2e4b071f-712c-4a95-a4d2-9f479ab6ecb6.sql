CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(p_kpi_ratings jsonb, p_is_na boolean DEFAULT false, p_remarks text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  old_score numeric;
  result jsonb := '[]'::jsonb;
  propagated_count int := 0;
  v_evidence_url text;
  v_evidence_urls jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    SELECT self_score INTO old_score
    FROM review_submissions WHERE kpi_id = (item->>'kpi_id')::uuid;

    v_evidence_url := item->>'evidence_url';
    v_evidence_urls := CASE
      WHEN v_evidence_url IS NOT NULL AND v_evidence_url != ''
      THEN jsonb_build_array(v_evidence_url)
      ELSE NULL
    END;

    INSERT INTO review_submissions (kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role, self_evidence_url, self_evidence_urls, self_remarks, updated_at)
    VALUES (
      (item->>'kpi_id')::uuid,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_rating')::text::rating_level END,
      p_is_na,
      CASE WHEN p_is_na THEN 'admin' ELSE NULL END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_url END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_urls END,
      CASE WHEN p_is_na THEN NULL ELSE p_remarks END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      self_evidence_url = COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls = COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks = COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at = now();

    UPDATE kpis SET status = 'self_review'
    WHERE id = (item->>'kpi_id')::uuid AND status = 'kra_set';

    propagated_count := propagated_count + 1;

    result := result || jsonb_build_object(
      'kpi_id', item->>'kpi_id',
      'old_score', old_score,
      'new_score', CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END
    );
  END LOOP;

  RETURN jsonb_build_object('propagated_count', propagated_count, 'details', result);
END;
$function$;
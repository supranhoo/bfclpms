
-- Short-circuit enqueue_pms_compression_jobs when no evidence array changed
CREATE OR REPLACE FUNCTION public.enqueue_pms_compression_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_col text;
  v_old jsonb;
  v_new jsonb;
  v_url text;
  v_idx integer;
  v_cols text[] := ARRAY[
    'self_evidence_urls','manager_evidence_urls','auditor_evidence_urls',
    'hr_pms_evidence_urls','management_evidence_urls','skip_level_evidence_urls'
  ];
BEGIN
  -- Fast path: on UPDATE, skip entirely if none of the evidence arrays changed.
  IF TG_OP = 'UPDATE'
     AND OLD.self_evidence_urls IS NOT DISTINCT FROM NEW.self_evidence_urls
     AND OLD.manager_evidence_urls IS NOT DISTINCT FROM NEW.manager_evidence_urls
     AND OLD.auditor_evidence_urls IS NOT DISTINCT FROM NEW.auditor_evidence_urls
     AND OLD.hr_pms_evidence_urls IS NOT DISTINCT FROM NEW.hr_pms_evidence_urls
     AND OLD.management_evidence_urls IS NOT DISTINCT FROM NEW.management_evidence_urls
     AND OLD.skip_level_evidence_urls IS NOT DISTINCT FROM NEW.skip_level_evidence_urls
  THEN
    RETURN NEW;
  END IF;

  FOREACH v_col IN ARRAY v_cols LOOP
    EXECUTE format('SELECT to_jsonb($1.%I)', v_col) INTO v_new USING NEW;
    IF TG_OP = 'UPDATE' THEN
      EXECUTE format('SELECT to_jsonb($1.%I)', v_col) INTO v_old USING OLD;
    ELSE
      v_old := '[]'::jsonb;
    END IF;

    IF v_new IS NULL OR jsonb_typeof(v_new) <> 'array' THEN CONTINUE; END IF;

    v_idx := 0;
    FOR v_url IN SELECT jsonb_array_elements_text(v_new) LOOP
      IF public.is_image_url(v_url)
         AND (v_old IS NULL OR NOT v_old @> to_jsonb(v_url)) THEN
        INSERT INTO public.pms_evidence_compression_jobs
          (source_table, source_id, source_column, array_index, original_url)
        VALUES ('review_submissions', NEW.id, v_col, v_idx, v_url)
        ON CONFLICT (source_table, source_id, source_column, array_index, original_url)
        DO NOTHING;
      END IF;
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Narrow log_untracked_submission_changes to reviewer-stage scores only.
-- Self-score writes are already audited by the client (SELF_REVIEW_SUBMITTED),
-- so re-logging them here was duplicate work on the hottest write path.
CREATE OR REPLACE FUNCTION public.log_untracked_submission_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.management_score IS DISTINCT FROM NEW.management_score
     OR OLD.auditor_score IS DISTINCT FROM NEW.auditor_score
     OR OLD.final_score IS DISTINCT FROM NEW.final_score
     OR OLD.manager_score IS DISTINCT FROM NEW.manager_score
     OR OLD.skip_level_score IS DISTINCT FROM NEW.skip_level_score
     OR OLD.hr_pms_score IS DISTINCT FROM NEW.hr_pms_score THEN

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.kpi_id,
      'SUBMISSION_SCORE_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'self_score', OLD.self_score,
        'manager_score', OLD.manager_score,
        'skip_level_score', OLD.skip_level_score,
        'hr_pms_score', OLD.hr_pms_score,
        'auditor_score', OLD.auditor_score,
        'management_score', OLD.management_score,
        'final_score', OLD.final_score
      ),
      jsonb_build_object(
        'self_score', NEW.self_score,
        'manager_score', NEW.manager_score,
        'skip_level_score', NEW.skip_level_score,
        'hr_pms_score', NEW.hr_pms_score,
        'auditor_score', NEW.auditor_score,
        'management_score', NEW.management_score,
        'final_score', NEW.final_score
      ),
      jsonb_build_object('source', 'safety_net_trigger')
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Faster lookup for active locks scanned by prevent_locked_submission_updates → check_review_period_permission
CREATE INDEX IF NOT EXISTS idx_rpl_active_period_type
  ON public.review_period_locks (review_period_id, lock_type)
  WHERE is_locked = true;

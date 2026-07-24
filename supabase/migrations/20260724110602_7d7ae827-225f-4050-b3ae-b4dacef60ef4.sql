
-- ADR-155 (retry): BU/Dept collapse false-complete repair + normalisation

ALTER TABLE public.annual_review_access_audit
  DROP CONSTRAINT IF EXISTS annual_review_access_audit_action_check;
ALTER TABLE public.annual_review_access_audit
  ADD CONSTRAINT annual_review_access_audit_action_check CHECK (action = ANY (ARRAY[
    'kill_switch_toggled','override_upserted','override_deleted',
    'management_stage.backfilled','management_stage.backfilled_bulk',
    'management_stage.reverted','management_stage.reverted_after',
    'bu_terminal_restore','collapse_normalise'
  ]));

DO $$
DECLARE
  v_cycle uuid;
  r RECORD;
  v_wiped jsonb;
BEGIN
  SELECT id INTO v_cycle FROM public.annual_review_cycles WHERE status='active' ORDER BY created_at DESC LIMIT 1;
  IF v_cycle IS NULL THEN RAISE NOTICE 'No active cycle'; RETURN; END IF;

  FOR r IN
    SELECT i.id, i.employee_id, i.template_id, i.overall_status, i.bu_head_id
    FROM public.annual_review_instances i
    WHERE i.cycle_id = v_cycle
      AND i.overall_status = 'completed'
      AND i.dept_head_id IS NOT NULL
      AND i.bu_head_id IS NOT NULL
      AND i.dept_head_id = i.bu_head_id
      AND NOT EXISTS (
        SELECT 1 FROM public.annual_review_responses r2
        WHERE r2.instance_id = i.id AND r2.reviewer_role = 'bu_head' AND r2.is_locked
      )
  LOOP
    SELECT COALESCE(jsonb_agg(to_jsonb(rr.*)), '[]'::jsonb) INTO v_wiped
    FROM public.annual_review_responses rr
    WHERE rr.instance_id = r.id AND rr.reviewer_role = 'dept_head';

    INSERT INTO public.annual_review_reset_archive
      (instance_id, employee_id, cycle_id, prior_template_id, new_template_id, prior_status, wiped_responses, wiped_proxy_submissions, reason, reset_by, reset_at)
    VALUES
      (r.id, r.employee_id, v_cycle, r.template_id, r.template_id, r.overall_status, v_wiped, '[]'::jsonb,
       'ADR-155: BU/Dept collapse false-complete — Rakesh Gupta grievance', r.bu_head_id, now());

    DELETE FROM public.annual_review_responses
    WHERE instance_id = r.id AND reviewer_role = 'dept_head';

    UPDATE public.annual_review_instances
    SET overall_status = 'pending_bu',
        total_score = NULL,
        criteria_weighted_score = NULL,
        final_rating = NULL,
        finalized_at = NULL,
        finalized_by = NULL,
        enabled_stages = to_jsonb(ARRAY['self','bu_head']::text[]),
        updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.annual_review_access_audit(actor_id, target_user_id, action, before, after, reason)
    VALUES (NULL, r.employee_id, 'bu_terminal_restore',
      jsonb_build_object('overall_status','completed','stray_dept_head_responses', v_wiped),
      jsonb_build_object('overall_status','pending_bu','enabled_stages',ARRAY['self','bu_head']),
      'ADR-155: Rakesh Gupta grievance — restored terminal BU stage for collapsed dept=BU instance');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_collapsed_dept_bu_normalise()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stages text[];
BEGIN
  IF NEW.dept_head_id IS NOT NULL
     AND NEW.bu_head_id IS NOT NULL
     AND NEW.dept_head_id = NEW.bu_head_id
     AND NEW.enabled_stages IS NOT NULL THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(NEW.enabled_stages)) INTO v_stages;
    IF 'dept_head' = ANY(v_stages) AND 'bu_head' = ANY(v_stages) THEN
      v_stages := ARRAY(SELECT unnest(v_stages) EXCEPT SELECT 'dept_head');
      NEW.enabled_stages := to_jsonb(v_stages);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_collapsed_dept_bu_normalise ON public.annual_review_instances;
CREATE TRIGGER trg_enforce_collapsed_dept_bu_normalise
BEFORE INSERT OR UPDATE OF dept_head_id, bu_head_id, enabled_stages
ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.enforce_collapsed_dept_bu_normalise();

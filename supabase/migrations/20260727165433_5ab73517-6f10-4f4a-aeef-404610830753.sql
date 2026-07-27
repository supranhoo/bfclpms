-- ADR-184 / POLICY §AR-REPAIR-NO-DOWNSTREAM-REWIND

CREATE TABLE IF NOT EXISTS public.annual_review_downstream_rewind_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_code text,
  prev_overall_status text,
  new_overall_status text,
  prev_total_score numeric,
  prev_criteria_weighted_score numeric,
  prev_final_rating text,
  new_total_score numeric,
  new_criteria_weighted_score numeric,
  new_final_rating text,
  relocked_roles text[],
  reason text,
  repaired_by uuid,
  repaired_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_downstream_rewind_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_downstream_rewind_repair_2026_07 TO service_role;
ALTER TABLE public.annual_review_downstream_rewind_repair_2026_07 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read downstream rewind repairs" ON public.annual_review_downstream_rewind_repair_2026_07;
CREATE POLICY "admins read downstream rewind repairs"
  ON public.annual_review_downstream_rewind_repair_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

-- Canonical stage ordinal helper -------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_stage_ord(p_role text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE lower(p_role)
    WHEN 'self' THEN 1 WHEN 'manager' THEN 2 WHEN 'skip_manager' THEN 3
    WHEN 'dept_head' THEN 4 WHEN 'bu_head' THEN 5 WHEN 'hr' THEN 6
    WHEN 'management' THEN 7 ELSE 99 END;
$$;

CREATE OR REPLACE FUNCTION public.annual_review_status_ord(p_status text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_status
    WHEN 'pending_self' THEN 1 WHEN 'pending_manager' THEN 2 WHEN 'pending_skip' THEN 3
    WHEN 'pending_dept' THEN 4 WHEN 'pending_bu' THEN 5 WHEN 'pending_hr' THEN 6
    WHEN 'pending_management' THEN 7 ELSE NULL END;
$$;

-- Guard: never land on a pending stage that a LATER stage already actioned ---
CREATE OR REPLACE FUNCTION public.tg_ar_no_downstream_rewind()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_ord integer;
  v_late text;
BEGIN
  IF NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('annual_review.bypass_downstream_rewind_guard', true),'off') = 'on' THEN
    RETURN NEW;
  END IF;

  v_ord := public.annual_review_status_ord(NEW.overall_status::text);
  IF v_ord IS NULL THEN RETURN NEW; END IF;

  SELECT r.reviewer_role::text INTO v_late
    FROM public.annual_review_responses r
   WHERE r.instance_id = NEW.id
     AND r.is_locked = true
     AND public.annual_review_stage_ord(r.reviewer_role::text) > v_ord
     AND COALESCE(NEW.enabled_stages,'[]'::jsonb) ? r.reviewer_role::text
   ORDER BY public.annual_review_stage_ord(r.reviewer_role::text) DESC
   LIMIT 1;

  IF v_late IS NOT NULL THEN
    RAISE EXCEPTION
      'ADR-184: cannot set instance % to % — stage % already has a locked response. Unlock/archive the downstream stage first.',
      NEW.id, NEW.overall_status, v_late
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ar_no_downstream_rewind ON public.annual_review_instances;
CREATE TRIGGER trg_ar_no_downstream_rewind
  BEFORE UPDATE OF overall_status ON public.annual_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_ar_no_downstream_rewind();

-- Diagnostic ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_downstream_rewind_diagnostic()
RETURNS TABLE(instance_id uuid, employee_code text, full_name text,
              overall_status text, latest_locked_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id, p.employee_code, p.full_name, i.overall_status::text,
         (SELECT r.reviewer_role::text FROM public.annual_review_responses r
           WHERE r.instance_id = i.id AND r.is_locked
           ORDER BY public.annual_review_stage_ord(r.reviewer_role::text) DESC LIMIT 1)
    FROM public.annual_review_instances i
    JOIN public.profiles p ON p.id = i.employee_id
   WHERE public.annual_review_status_ord(i.overall_status::text) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.annual_review_responses r
        WHERE r.instance_id = i.id AND r.is_locked
          AND public.annual_review_stage_ord(r.reviewer_role::text)
              > public.annual_review_status_ord(i.overall_status::text))
     AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
$$;

GRANT EXECUTE ON FUNCTION public.annual_review_downstream_rewind_diagnostic() TO authenticated;

-- Repair -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.annual_review_repair_downstream_rewind(
  p_instance_id uuid, p_reason text)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inst public.annual_review_instances%ROWTYPE;
  v_last_ord integer;
  v_next_role text;
  v_new_status public.annual_review_status;
  v_relocked text[] := ARRAY[]::text[];
  v_sum record;
  v_code text;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can run this repair.';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_inst.id IS NULL THEN RAISE EXCEPTION 'Instance not found.'; END IF;

  SELECT max(public.annual_review_stage_ord(r.reviewer_role::text)) INTO v_last_ord
    FROM public.annual_review_responses r
   WHERE r.instance_id = p_instance_id AND r.is_locked;

  IF v_last_ord IS NULL THEN
    RAISE EXCEPTION 'No locked response on instance % — nothing to repair.', p_instance_id;
  END IF;

  -- Re-lock any enabled stage at/below the last actioned stage that lost its lock.
  PERFORM set_config('annual_review.bypass_stage_score_guard','on', true);
  WITH upd AS (
    UPDATE public.annual_review_responses r
       SET is_locked = true,
           submitted_at = COALESCE(r.submitted_at, now()),
           updated_at = now()
     WHERE r.instance_id = p_instance_id
       AND r.is_locked = false
       AND COALESCE(v_inst.enabled_stages,'[]'::jsonb) ? r.reviewer_role::text
       AND public.annual_review_stage_ord(r.reviewer_role::text) <= v_last_ord
    RETURNING r.reviewer_role::text AS role)
  SELECT COALESCE(array_agg(role), ARRAY[]::text[]) INTO v_relocked FROM upd;
  PERFORM set_config('annual_review.bypass_stage_score_guard','off', true);

  -- First enabled stage, canonical order, with no locked response.
  SELECT s.role INTO v_next_role
    FROM (SELECT lower(x) AS role, public.annual_review_stage_ord(lower(x)) AS ord
            FROM jsonb_array_elements_text(COALESCE(v_inst.enabled_stages,'[]'::jsonb)) x) s
   WHERE NOT EXISTS (SELECT 1 FROM public.annual_review_responses r
                      WHERE r.instance_id = p_instance_id AND r.is_locked
                        AND r.reviewer_role::text = s.role)
   ORDER BY s.ord LIMIT 1;

  IF v_next_role IS NULL THEN
    v_new_status := 'completed'::public.annual_review_status;
  ELSE
    v_new_status := CASE v_next_role
      WHEN 'self' THEN 'pending_self' WHEN 'manager' THEN 'pending_manager'
      WHEN 'skip_manager' THEN 'pending_skip' WHEN 'dept_head' THEN 'pending_dept'
      WHEN 'bu_head' THEN 'pending_bu' WHEN 'hr' THEN 'pending_hr'
      ELSE 'pending_management' END::public.annual_review_status;
  END IF;

  SELECT * INTO v_sum FROM public.annual_review_compute_final_summary(p_instance_id);
  SELECT p.employee_code INTO v_code FROM public.profiles p WHERE p.id = v_inst.employee_id;

  IF v_new_status = 'completed'::public.annual_review_status THEN
    UPDATE public.annual_review_instances
       SET overall_status = v_new_status,
           total_score = v_sum.total_score,
           criteria_weighted_score = v_sum.criteria_weighted_score,
           final_rating = v_sum.final_rating,
           finalized_at = COALESCE(finalized_at, now()),
           updated_at = now()
     WHERE id = p_instance_id;
  ELSE
    UPDATE public.annual_review_instances
       SET overall_status = v_new_status, updated_at = now()
     WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.annual_review_downstream_rewind_repair_2026_07(
    instance_id, employee_code, prev_overall_status, new_overall_status,
    prev_total_score, prev_criteria_weighted_score, prev_final_rating,
    new_total_score, new_criteria_weighted_score, new_final_rating,
    relocked_roles, reason, repaired_by)
  VALUES (p_instance_id, v_code, v_inst.overall_status::text, v_new_status::text,
          v_inst.total_score, v_inst.criteria_weighted_score, v_inst.final_rating,
          v_sum.total_score, v_sum.criteria_weighted_score, v_sum.final_rating,
          v_relocked, p_reason, v_caller);

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.repair_downstream_rewind', v_caller, jsonb_build_object(
    'instance_id', p_instance_id, 'new_status', v_new_status,
    'relocked_roles', v_relocked, 'reason', p_reason));

  RETURN v_new_status;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_repair_downstream_rewind(uuid, text) TO authenticated;

-- ADR-138 (part 2 of 2): Wire Management as the terminal review stage.

-- 1) Slot column on the instance ---------------------------------------------
ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS management_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_ari_management_id
  ON public.annual_review_instances(management_id);

-- 2) Resolver: BU Head's reporting manager → Management fallback -------------
CREATE OR REPLACE FUNCTION public.resolve_management_reviewer(
  p_bu_head_id uuid,
  p_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reports_to uuid;
  v_result     uuid;
BEGIN
  IF p_bu_head_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Preferred: BU Head's reporting manager IF they hold the 'management' role
  SELECT p.reporting_manager_id INTO v_reports_to
    FROM public.profiles p
   WHERE p.id = p_bu_head_id;

  IF v_reports_to IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = v_reports_to AND ur.role = 'management')
     AND EXISTS (SELECT 1 FROM public.profiles pm
                  WHERE pm.id = v_reports_to AND pm.is_active = true) THEN
    v_result := v_reports_to;
  ELSE
    -- Fallback: pick any active user with the 'management' role.
    -- Stable ordering so the same person is picked every time.
    SELECT ur.user_id INTO v_result
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role = 'management'
       AND p.is_active = true
     ORDER BY p.employee_code NULLS LAST, ur.user_id
     LIMIT 1;
  END IF;

  -- Self-loop guards: skip stage if the resolved reviewer is the BU Head
  -- themselves or the employee under review.
  IF v_result IS NOT NULL
     AND (v_result = p_bu_head_id OR v_result = p_employee_id) THEN
    RETURN NULL;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_management_reviewer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_management_reviewer(uuid, uuid) TO authenticated, service_role;

-- 3) BEFORE-trigger: keep enabled_stages + management_id coherent ------------
CREATE OR REPLACE FUNCTION public.enforce_management_terminal_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_bu    boolean;
  v_resolved  uuid;
  v_stages    jsonb;
BEGIN
  v_stages := COALESCE(NEW.enabled_stages, '[]'::jsonb);
  v_has_bu := v_stages ? 'bu_head';

  IF NOT v_has_bu OR NEW.bu_head_id IS NULL THEN
    -- No BU stage / no BU head → no management stage; keep column NULL.
    NEW.management_id := NULL;
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_management_reviewer(NEW.bu_head_id, NEW.employee_id);
  NEW.management_id := v_resolved;

  IF v_resolved IS NULL THEN
    -- Self-loop or no management user → strip 'management' if present.
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
  ELSE
    -- Append 'management' if missing.
    IF NOT (v_stages ? 'management') THEN
      NEW.enabled_stages := v_stages || jsonb_build_array('management');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_enforce_mgmt_stage ON public.annual_review_instances;
CREATE TRIGGER trg_ar_enforce_mgmt_stage
BEFORE INSERT OR UPDATE OF enabled_stages, bu_head_id, employee_id
ON public.annual_review_instances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_management_terminal_stage();

-- 4) Extend effective-chain helpers to know about 'management' ---------------
CREATE OR REPLACE FUNCTION public.annual_review_effective_chain_details(p_instance_id uuid)
 RETURNS TABLE(stage annual_reviewer_role, reviewer_id uuid, skipped boolean, skip_reason text, duplicate_of annual_reviewer_role)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  r record;
  v_kept_ids   uuid[]   := ARRAY[]::uuid[];
  v_kept_stage text[]   := ARRAY[]::text[];
  v_active boolean;
  v_skipped boolean;
  v_reason text;
  v_dup_of text;
  v_idx int;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  FOR r IN
    SELECT s, ord
      FROM (VALUES ('management',1),('hr',2),('bu_head',3),('dept_head',4),
                   ('skip_manager',5),('manager',6),('self',7)) AS t(s,ord)
     WHERE v_inst.enabled_stages ? s
     ORDER BY ord
  LOOP
    stage       := r.s::public.annual_reviewer_role;
    reviewer_id := CASE r.s
      WHEN 'self'         THEN v_inst.employee_id
      WHEN 'manager'      THEN v_inst.manager_id
      WHEN 'skip_manager' THEN v_inst.skip_id
      WHEN 'dept_head'    THEN v_inst.dept_head_id
      WHEN 'bu_head'      THEN v_inst.bu_head_id
      WHEN 'hr'           THEN v_inst.hr_id
      WHEN 'management'   THEN v_inst.management_id
    END;
    skipped := false; skip_reason := NULL; duplicate_of := NULL;

    IF r.s = 'self' THEN
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF reviewer_id IS NULL THEN
      v_skipped := true; v_reason := 'no_reviewer_mapped';
    ELSIF reviewer_id = v_inst.employee_id THEN
      v_skipped := true; v_reason := 'self_assignment';
    ELSE
      SELECT is_active INTO v_active FROM public.profiles WHERE id = reviewer_id;
      IF v_active IS DISTINCT FROM true THEN
        v_skipped := false; v_reason := 'reviewer_inactive';
        v_kept_ids   := v_kept_ids   || reviewer_id;
        v_kept_stage := v_kept_stage || r.s;
      ELSE
        v_idx := array_position(v_kept_ids, reviewer_id);
        IF v_idx IS NOT NULL THEN
          v_skipped := true; v_reason := 'duplicate_reviewer';
          v_dup_of := v_kept_stage[v_idx];
        ELSE
          v_skipped := false; v_reason := NULL;
          v_kept_ids   := v_kept_ids   || reviewer_id;
          v_kept_stage := v_kept_stage || r.s;
        END IF;
      END IF;
    END IF;

    skipped      := v_skipped;
    skip_reason  := v_reason;
    duplicate_of := CASE WHEN v_dup_of IS NOT NULL THEN v_dup_of::public.annual_reviewer_role ELSE NULL END;
    v_dup_of := NULL;
    RETURN NEXT;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.annual_review_effective_chain(p_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(stage ORDER BY ord), '[]'::jsonb) INTO v_result
    FROM public.annual_review_effective_chain_details(p_instance_id) d
    JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6),('management',7)) t(s, ord)
      ON t.s = d.stage::text
   WHERE NOT d.skipped;

  IF NOT (v_result ? 'self') THEN
    v_result := '["self"]'::jsonb;
  END IF;
  RETURN v_result;
END $function$;

-- 5) advance RPC: recognise Management + update terminal ordering ------------
CREATE OR REPLACE FUNCTION public.advance_annual_review_status(p_instance_id uuid, p_reviewer_role annual_reviewer_role)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_effective jsonb;
  v_skipped jsonb;
  v_next public.annual_review_status;
  v_orig_enabled jsonb;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
  v_weighted numeric;
  v_summary  RECORD;
  v_terminal_role text;
  v_terminal_reviewer uuid;
  v_src_row public.annual_review_responses%ROWTYPE;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF v_inst.overall_status = 'excluded' THEN
    RAISE EXCEPTION 'instance is excluded from this cycle and cannot be submitted';
  END IF;

  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'self'         AND (v_inst.employee_id  <> v_caller OR v_inst.overall_status <> 'pending_self')) OR
       (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip')) OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept')) OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu')) OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr')) OR
       (p_reviewer_role = 'management'   AND (v_inst.management_id<> v_caller OR v_inst.overall_status <> 'pending_management'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_weighted := public.compute_annual_review_weighted_score(p_instance_id, p_reviewer_role);

  UPDATE public.annual_review_responses
     SET is_locked = true,
         submitted_at = COALESCE(submitted_at, now()),
         weighted_score = COALESCE(v_weighted, weighted_score)
   WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role;

  v_effective    := public.annual_review_effective_chain(p_instance_id);
  v_orig_enabled := v_inst.enabled_stages;
  v_next         := public.annual_review_next_status(v_effective, v_inst.overall_status);

  IF v_orig_enabled <> v_effective THEN
    SELECT jsonb_agg(jsonb_build_object(
             'stage', stage,
             'reviewer_id', reviewer_id,
             'reason', skip_reason,
             'duplicate_of', duplicate_of))
      INTO v_skipped
      FROM public.annual_review_effective_chain_details(p_instance_id)
     WHERE skipped;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.stage_auto_skipped', v_caller, jsonb_build_object(
      'instance_id',     p_instance_id,
      'from_stage',      p_reviewer_role,
      'enabled',         v_orig_enabled,
      'effective',       v_effective,
      'skipped_stages',  COALESCE(v_skipped, '[]'::jsonb),
      'resolved_to',     v_next
    ));
  END IF;

  IF v_next = 'completed' THEN
    SELECT stage::text INTO v_terminal_role
      FROM public.annual_review_effective_chain_details(p_instance_id) d
      JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6),('management',7)) t(s, ord)
        ON t.s = d.stage::text
     WHERE NOT d.skipped
     ORDER BY ord DESC
     LIMIT 1;

    IF v_terminal_role IS NOT NULL AND v_terminal_role <> p_reviewer_role::text THEN
      v_terminal_reviewer := CASE v_terminal_role
        WHEN 'manager'      THEN v_inst.manager_id
        WHEN 'skip_manager' THEN v_inst.skip_id
        WHEN 'dept_head'    THEN v_inst.dept_head_id
        WHEN 'bu_head'      THEN v_inst.bu_head_id
        WHEN 'hr'           THEN v_inst.hr_id
        WHEN 'management'   THEN v_inst.management_id
        ELSE NULL
      END;

      IF v_terminal_reviewer IS NULL OR v_terminal_reviewer <> v_caller THEN
        RAISE EXCEPTION 'ADR-137: cannot mirror % submission to terminal stage % — terminal reviewer differs from caller',
          p_reviewer_role, v_terminal_role
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT * INTO v_src_row
        FROM public.annual_review_responses
       WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role
       LIMIT 1;

      INSERT INTO public.annual_review_responses (
        instance_id, reviewer_role, reviewer_id,
        criteria_scores, weighted_score, comments,
        is_locked, submitted_at
      )
      VALUES (
        p_instance_id, v_terminal_role::public.annual_reviewer_role, v_caller,
        COALESCE(v_src_row.criteria_scores, '{}'::jsonb),
        v_src_row.weighted_score,
        v_src_row.comments,
        true, now()
      )
      ON CONFLICT (instance_id, reviewer_role) DO UPDATE
        SET reviewer_id     = EXCLUDED.reviewer_id,
            criteria_scores = EXCLUDED.criteria_scores,
            weighted_score  = EXCLUDED.weighted_score,
            comments        = COALESCE(public.annual_review_responses.comments, EXCLUDED.comments),
            is_locked       = true,
            submitted_at    = COALESCE(public.annual_review_responses.submitted_at, now());

      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES ('annual_review.duplicate_reviewer_mirror', v_caller, jsonb_build_object(
        'instance_id',  p_instance_id,
        'from_role',    p_reviewer_role,
        'to_role',      v_terminal_role,
        'reviewer_id',  v_caller
      ));
    END IF;
  END IF;

  IF v_next = 'completed'
     AND v_inst.criteria_weighted_score IS NULL THEN
    SELECT * INTO v_summary
      FROM public.annual_review_compute_final_summary(p_instance_id);

    UPDATE public.annual_review_instances
       SET overall_status           = v_next,
           finalized_at             = now(),
           finalized_by             = v_caller,
           criteria_weighted_score  = v_summary.criteria_weighted_score,
           total_score              = v_summary.total_score,
           final_rating             = v_summary.final_rating,
           updated_at               = now()
     WHERE id = p_instance_id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.terminal_auto_finalized', v_caller, jsonb_build_object(
      'instance_id',              p_instance_id,
      'terminal_stage',           p_reviewer_role,
      'criteria_weighted_score',  v_summary.criteria_weighted_score,
      'total_score',              v_summary.total_score,
      'final_rating',             v_summary.final_rating
    ));
  ELSE
    UPDATE public.annual_review_instances
       SET overall_status = v_next,
           finalized_at = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_at, now()) ELSE finalized_at END,
           finalized_by = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_by, v_caller) ELSE finalized_by END,
           updated_at = now()
     WHERE id = p_instance_id;
  END IF;

  RETURN v_next;
END $function$;

-- 6) rollback RPC: include Management as most senior terminal ---------------
CREATE OR REPLACE FUNCTION public.rollback_annual_review_completed(p_instance_id uuid, p_reason text)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_inst   public.annual_review_instances%ROWTYPE;
  v_from_status public.annual_review_status;
  v_stages jsonb;
  v_enabled_terminal_stage text;
  v_terminal_stage text;
  v_new_status public.annual_review_status;
  v_present_roles text[];
  v_unlocked int;
  v_candidate text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may roll back a finalized annual review';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances
   WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF v_inst.overall_status <> 'completed' THEN
    RAISE EXCEPTION 'only completed / finalized instances can be rolled back (current: %)',
      v_inst.overall_status;
  END IF;

  v_from_status := v_inst.overall_status;
  v_stages := COALESCE(to_jsonb(v_inst.enabled_stages), '[]'::jsonb);
  IF jsonb_array_length(v_stages) = 0 THEN
    RAISE EXCEPTION 'enabled_stages missing on instance %', p_instance_id;
  END IF;

  IF v_stages ? 'management' THEN v_enabled_terminal_stage := 'management';
  ELSIF v_stages ? 'hr' THEN v_enabled_terminal_stage := 'hr';
  ELSIF v_stages ? 'bu_head' THEN v_enabled_terminal_stage := 'bu_head';
  ELSIF v_stages ? 'dept_head' THEN v_enabled_terminal_stage := 'dept_head';
  ELSIF v_stages ? 'skip_manager' THEN v_enabled_terminal_stage := 'skip_manager';
  ELSIF v_stages ? 'manager' THEN v_enabled_terminal_stage := 'manager';
  ELSE
    RAISE EXCEPTION 'instance % has no reviewer stage to roll back to (enabled_stages=%)',
      p_instance_id, v_stages;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT reviewer_role::text), ARRAY[]::text[])
    INTO v_present_roles
    FROM public.annual_review_responses
   WHERE instance_id = p_instance_id
     AND reviewer_role::text <> 'self';

  v_terminal_stage := NULL;
  FOREACH v_candidate IN ARRAY ARRAY['management','hr','bu_head','dept_head','skip_manager','manager']::text[] LOOP
    IF (v_stages ? v_candidate) AND (v_candidate = ANY(v_present_roles)) THEN
      v_terminal_stage := v_candidate;
      EXIT;
    END IF;
  END LOOP;

  IF v_terminal_stage IS NULL THEN
    RAISE EXCEPTION 'no reviewer response found on instance % to roll back to (enabled=%, present=%)',
      p_instance_id, v_stages, v_present_roles;
  END IF;

  v_new_status := CASE v_terminal_stage
    WHEN 'management'   THEN 'pending_management'::public.annual_review_status
    WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
    WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
    WHEN 'dept_head'    THEN 'pending_dept'::public.annual_review_status
    WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
    WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
  END;

  UPDATE public.annual_review_responses
     SET is_locked = false,
         submitted_at = NULL,
         notes = COALESCE(p_reason, notes)
   WHERE instance_id = p_instance_id
     AND reviewer_role = v_terminal_stage::public.annual_reviewer_role;
  GET DIAGNOSTICS v_unlocked = ROW_COUNT;

  IF v_unlocked = 0 THEN
    RAISE EXCEPTION 'terminal response (%) missing for instance %; cannot roll back cleanly',
      v_terminal_stage, p_instance_id;
  END IF;

  UPDATE public.annual_review_instances
     SET overall_status = v_new_status,
         final_rating   = NULL,
         hr_remarks     = NULL,
         finalized_at   = NULL,
         finalized_by   = NULL,
         total_score    = NULL,
         criteria_weighted_score = NULL,
         updated_at     = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.rollback_finalized', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'from_status', v_from_status,
    'to_status',   v_new_status,
    'terminal_stage', v_terminal_stage,
    'enabled_terminal_stage', v_enabled_terminal_stage,
    'present_reviewer_roles', to_jsonb(v_present_roles),
    'reason',      p_reason,
    'previous_final_rating', v_inst.final_rating,
    'previous_finalized_at', v_inst.finalized_at,
    'previous_finalized_by', v_inst.finalized_by,
    'adr', 'ADR-138'
  ));

  RETURN v_new_status;
END $function$;

-- 7) RLS: management reviewer can see responses on their instance ------------
DROP POLICY IF EXISTS responses_select_visible ON public.annual_review_responses;
CREATE POLICY responses_select_visible ON public.annual_review_responses
FOR SELECT
USING (
  (reviewer_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (
    (reviewer_role = 'self'::annual_reviewer_role)
    AND EXISTS (
      SELECT 1 FROM public.annual_review_instances i
       WHERE i.id = annual_review_responses.instance_id
         AND i.employee_id = auth.uid()
         AND i.overall_status = 'pending_self'::annual_review_status
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.id = annual_review_responses.instance_id
       AND (
         (i.employee_id = auth.uid() AND i.overall_status = 'completed'::annual_review_status)
         OR i.manager_id    = auth.uid()
         OR i.skip_id       = auth.uid()
         OR i.dept_head_id  = auth.uid()
         OR i.bu_head_id    = auth.uid()
         OR i.hr_id         = auth.uid()
         OR i.management_id = auth.uid()
       )
  )
);

-- 8) Assistance access helper: management users get 'all' scope --------------
-- (annual_review_directory_access already treats hr_pms/admin as 'all';
-- extend it to include the 'management' role.)
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE proname='annual_review_directory_access' LIMIT 1;
  -- No-op guard: only patch if present and doesn't yet mention 'management'
  IF v_def IS NOT NULL AND position('''management''' in v_def) = 0 THEN
    EXECUTE $q$
      CREATE OR REPLACE FUNCTION public.can_access_annual_review_instance_for_assistance(p_instance_id uuid)
      RETURNS boolean
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
      DECLARE
        v_uid       uuid := auth.uid();
        v_access    jsonb;
        v_scope     text;
        v_bu_ids    uuid[];
        v_emp_bu    uuid;
        v_emp_id    uuid;
        v_emp_mgr   uuid;
        v_is_named  boolean;
      BEGIN
        IF v_uid IS NULL OR p_instance_id IS NULL THEN RETURN false; END IF;

        -- ADR-138: management users may assist on any instance in the cycle.
        IF public.has_role(v_uid, 'management'::app_role) THEN
          RETURN true;
        END IF;

        SELECT i.employee_id,
               d.business_unit_id,
               p.reporting_manager_id,
               (i.manager_id = v_uid OR i.skip_id = v_uid
                OR i.dept_head_id = v_uid OR i.bu_head_id = v_uid
                OR i.management_id = v_uid)
          INTO v_emp_id, v_emp_bu, v_emp_mgr, v_is_named
        FROM public.annual_review_instances i
        LEFT JOIN public.profiles p    ON p.id = i.employee_id
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE i.id = p_instance_id;

        IF v_emp_id IS NULL THEN RETURN false; END IF;

        v_access := public.annual_review_directory_access(v_uid);
        IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
          RETURN false;
        END IF;

        v_scope  := v_access->>'scope';
        v_bu_ids := COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_access->'business_unit_ids'))::uuid[],
          CASE WHEN NULLIF(v_access->>'business_unit_id','') IS NOT NULL
               THEN ARRAY[(v_access->>'business_unit_id')::uuid]
               ELSE ARRAY[]::uuid[] END
        );

        IF v_scope = 'all' THEN RETURN true; END IF;
        IF v_scope = 'bu' AND v_emp_bu IS NOT NULL AND v_emp_bu = ANY(v_bu_ids) THEN
          RETURN true;
        END IF;
        IF v_scope = 'team' THEN
          IF COALESCE(v_is_named, false) THEN RETURN true; END IF;
          IF v_emp_mgr = v_uid THEN RETURN true; END IF;
          IF EXISTS (SELECT 1 FROM public.profiles pm
                      WHERE pm.id = v_emp_mgr AND pm.reporting_manager_id = v_uid) THEN
            RETURN true;
          END IF;
        END IF;
        RETURN false;
      END;
      $body$;
    $q$;
  END IF;
END $do$;

-- 9) Backfill: apply Management stage on all open instances ------------------
-- Only touch instances that are not yet completed / excluded, that have BU as
-- part of enabled_stages, and where management_id is not already set. The
-- BEFORE trigger will resolve management_id, append 'management' to
-- enabled_stages, and honour the self-loop guard.
UPDATE public.annual_review_instances
   SET updated_at = now()
 WHERE overall_status NOT IN ('completed','excluded')
   AND enabled_stages ? 'bu_head'
   AND (management_id IS NULL OR NOT (enabled_stages ? 'management'));

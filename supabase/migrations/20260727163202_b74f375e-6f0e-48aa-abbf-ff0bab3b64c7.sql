CREATE TABLE public.annual_review_bu_removal_repair_2026_07 (
  id bigserial PRIMARY KEY,
  instance_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  before_status text,
  before_stages jsonb,
  before_total_score numeric,
  before_final_rating text,
  after_status text,
  after_total_score numeric,
  after_criteria_weighted_score numeric,
  after_final_rating text,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_bu_removal_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_bu_removal_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_bu_removal_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_bu_removal_repair_admin_read"
ON public.annual_review_bu_removal_repair_2026_07
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

-- ADR-183: supersede must promote to terminal when every enabled stage is actioned.
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text,
  p_mode text DEFAULT 'safe'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_instance public.annual_review_instances;
  v_prev jsonb;
  v_added_roles text[];
  v_removed_roles text[];
  v_has_responses boolean;
  v_status public.annual_review_status;
  v_new_status public.annual_review_status;
  v_employee_id uuid;
  v_next_role text;
  v_sum record;
BEGIN
  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can edit workflow stages.';
  END IF;
  IF p_mode NOT IN ('safe','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR jsonb_array_length(p_enabled_stages) = 0 THEN
    RAISE EXCEPTION 'At least one stage must be enabled.';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;
  v_employee_id := v_instance.employee_id;
  v_status := v_instance.overall_status;
  v_prev := COALESCE(v_instance.enabled_stages, '[]'::jsonb);

  SELECT array_agg(x) INTO v_added_roles
    FROM (SELECT jsonb_array_elements_text(p_enabled_stages) EXCEPT SELECT jsonb_array_elements_text(v_prev)) t(x);
  SELECT array_agg(x) INTO v_removed_roles
    FROM (SELECT jsonb_array_elements_text(v_prev) EXCEPT SELECT jsonb_array_elements_text(p_enabled_stages)) t(x);
  v_added_roles := COALESCE(v_added_roles, ARRAY[]::text[]);
  v_removed_roles := COALESCE(v_removed_roles, ARRAY[]::text[]);

  SELECT EXISTS(
    SELECT 1 FROM public.annual_review_responses
     WHERE instance_id = p_instance_id AND is_locked = true
  ) INTO v_has_responses;

  IF p_mode = 'safe' AND v_has_responses AND array_length(v_removed_roles, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot remove stages once locked responses exist. Use supersede mode.';
  END IF;

  IF p_mode = 'supersede' THEN
    -- Archive (and delete) locked responses belonging to removed stages.
    PERFORM public.archive_annual_review_response(id, 'ADR-160: stage superseded — ' || COALESCE(p_reason,''))
      FROM public.annual_review_responses
     WHERE instance_id = p_instance_id
       AND is_locked = true
       AND reviewer_role::text = ANY(v_removed_roles);

    -- ADR-183: land on the first ENABLED stage, in canonical order, that has NO
    -- locked response yet. Never rewind onto a stage that is already actioned.
    SELECT s.role INTO v_next_role
      FROM (
        SELECT lower(x) AS role,
               CASE lower(x)
                 WHEN 'self'         THEN 1
                 WHEN 'manager'      THEN 2
                 WHEN 'skip_manager' THEN 3
                 WHEN 'dept_head'    THEN 4
                 WHEN 'bu_head'      THEN 5
                 WHEN 'hr'           THEN 6
                 WHEN 'management'   THEN 7
                 ELSE 99
               END AS ord
          FROM jsonb_array_elements_text(p_enabled_stages) x
      ) s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.annual_review_responses r
        WHERE r.instance_id = p_instance_id
          AND r.is_locked = true
          AND r.reviewer_role::text = s.role
     )
     ORDER BY s.ord
     LIMIT 1;

    IF v_next_role IS NULL THEN
      -- Every enabled stage is actioned → the review is terminal/complete.
      v_new_status := 'completed'::public.annual_review_status;
    ELSE
      v_new_status := CASE v_next_role
        WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
        WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
        WHEN 'dept_head'    THEN 'pending_dept'::public.annual_review_status
        WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
        WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
        WHEN 'management'   THEN 'pending_management'::public.annual_review_status
        WHEN 'self'         THEN 'pending_self'::public.annual_review_status
        ELSE 'pending_self'::public.annual_review_status
      END;
    END IF;

    IF v_new_status = 'completed'::public.annual_review_status THEN
      -- Recompute aggregates rather than wiping them.
      SELECT * INTO v_sum FROM public.annual_review_compute_final_summary(p_instance_id);
      UPDATE public.annual_review_instances
         SET criteria_weighted_score = v_sum.criteria_weighted_score,
             total_score             = v_sum.total_score,
             final_rating            = v_sum.final_rating,
             finalized_at            = COALESCE(finalized_at, now()),
             finalized_by            = COALESCE(finalized_by, v_caller)
       WHERE id = p_instance_id;
    ELSE
      UPDATE public.annual_review_instances
         SET total_score = NULL,
             final_rating = NULL,
             criteria_weighted_score = NULL,
             finalized_at = NULL,
             finalized_by = NULL
       WHERE id = p_instance_id;
    END IF;
  ELSE
    v_new_status := v_status;
  END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         manager_id     = CASE WHEN p_enabled_stages ? 'manager'      THEN manager_id     ELSE NULL END,
         skip_id        = CASE WHEN p_enabled_stages ? 'skip_manager' THEN skip_id        ELSE NULL END,
         dept_head_id   = CASE WHEN p_enabled_stages ? 'dept_head'    THEN dept_head_id   ELSE NULL END,
         bu_head_id     = CASE WHEN p_enabled_stages ? 'bu_head'      THEN bu_head_id     ELSE NULL END,
         hr_id          = CASE WHEN p_enabled_stages ? 'hr'           THEN hr_id          ELSE NULL END,
         management_id  = CASE WHEN p_enabled_stages ? 'management'   THEN management_id  ELSE NULL END,
         overall_status = CASE
            WHEN p_mode = 'supersede' THEN v_new_status
            WHEN v_status = 'not_started' THEN v_status
            WHEN v_has_responses THEN v_status
            ELSE v_new_status
         END,
         has_admin_workflow_override = true,
         updated_at = now()
   WHERE id = p_instance_id;

  DELETE FROM public.annual_review_assignment_overrides
   WHERE instance_id = p_instance_id
     AND role::text = ANY(v_removed_roles);

  INSERT INTO public.annual_review_access_audit(action, actor_id, target_user_id, after, reason)
  VALUES (
    'workflow_edited_post_action', v_caller, v_employee_id,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'prev_stages', v_prev,
      'new_stages', p_enabled_stages,
      'added', to_jsonb(v_added_roles),
      'removed', to_jsonb(v_removed_roles),
      'mode', p_mode,
      'prior_status', v_status,
      'new_status', v_new_status
    ),
    p_reason
  );
END;
$function$;
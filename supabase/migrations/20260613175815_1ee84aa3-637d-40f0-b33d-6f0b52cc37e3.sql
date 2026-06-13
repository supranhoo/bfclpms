
-- 1) Acknowledgment columns on instances
ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS acknowledged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by  uuid,
  ADD COLUMN IF NOT EXISTS employee_rebuttal text;

-- 2) Versioning columns on templates
ALTER TABLE public.annual_review_templates
  ADD COLUMN IF NOT EXISTS parent_template_id uuid REFERENCES public.annual_review_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 3) Allow employee acknowledgment even when the cycle is closed.
CREATE OR REPLACE FUNCTION public.block_when_annual_cycle_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_status   text;
  v_caller   uuid := auth.uid();
BEGIN
  -- Admin/HR bypass
  IF v_caller IS NOT NULL AND (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RETURN NEW;
  END IF;

  -- Employee acknowledgment exemption (instances only, UPDATE only)
  IF TG_TABLE_NAME = 'annual_review_instances' AND TG_OP = 'UPDATE'
     AND NEW.employee_id = v_caller
     AND NEW.acknowledged_at IS NOT NULL
     AND OLD.acknowledged_at IS NULL
     AND NEW.cycle_id        IS NOT DISTINCT FROM OLD.cycle_id
     AND NEW.template_id     IS NOT DISTINCT FROM OLD.template_id
     AND NEW.overall_status  IS NOT DISTINCT FROM OLD.overall_status
     AND NEW.final_rating    IS NOT DISTINCT FROM OLD.final_rating
     AND NEW.total_score     IS NOT DISTINCT FROM OLD.total_score
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'annual_review_instances' THEN
    v_cycle_id := COALESCE(NEW.cycle_id, OLD.cycle_id);
  ELSE
    SELECT cycle_id INTO v_cycle_id FROM public.annual_review_instances
     WHERE id = COALESCE(NEW.instance_id, OLD.instance_id);
  END IF;

  SELECT status INTO v_status FROM public.annual_review_cycles WHERE id = v_cycle_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'cycle % is closed — no further edits allowed', v_cycle_id;
  END IF;

  RETURN NEW;
END $$;

-- 4) Acknowledge RPC: employee marks own finalized review as acknowledged
CREATE OR REPLACE FUNCTION public.acknowledge_annual_review_instance(
  p_instance_id uuid,
  p_rebuttal    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_emp    uuid;
  v_status text;
  v_ack    timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT employee_id, overall_status::text, acknowledged_at
    INTO v_emp, v_status, v_ack
    FROM public.annual_review_instances
   WHERE id = p_instance_id;

  IF v_emp IS NULL THEN RAISE EXCEPTION 'instance not found'; END IF;
  IF v_emp <> v_caller THEN RAISE EXCEPTION 'only the employee may acknowledge their review'; END IF;
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'only completed reviews can be acknowledged (current: %)', v_status; END IF;
  IF v_ack IS NOT NULL THEN RAISE EXCEPTION 'this review has already been acknowledged'; END IF;

  UPDATE public.annual_review_instances
     SET acknowledged_at   = now(),
         acknowledged_by   = v_caller,
         employee_rebuttal = NULLIF(btrim(COALESCE(p_rebuttal,'')), ''),
         updated_at        = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.acknowledged', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'has_rebuttal', (p_rebuttal IS NOT NULL AND length(btrim(p_rebuttal)) > 0)
  ));
END $$;

GRANT EXECUTE ON FUNCTION public.acknowledge_annual_review_instance(uuid, text) TO authenticated;

-- 5) Template cloning (creates a new versioned copy)
CREATE OR REPLACE FUNCTION public.clone_annual_review_template(
  p_source_id uuid,
  p_new_name  text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_id uuid;
  v_root   uuid;
  v_next_version integer;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may clone templates';
  END IF;

  -- Walk up to the root template to compute the next version number.
  SELECT COALESCE(parent_template_id, id) INTO v_root
    FROM public.annual_review_templates WHERE id = p_source_id;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.annual_review_templates
   WHERE id = v_root OR parent_template_id = v_root;

  INSERT INTO public.annual_review_templates(
    name, description, is_active, sections, created_by, parent_template_id, version
  )
  SELECT COALESCE(NULLIF(btrim(p_new_name),''), name || ' (v' || v_next_version || ')'),
         description, false, sections, v_caller, v_root, v_next_version
    FROM public.annual_review_templates WHERE id = p_source_id
  RETURNING id INTO v_new_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.template_cloned', v_caller, jsonb_build_object(
    'source_id', p_source_id, 'new_id', v_new_id, 'version', v_next_version
  ));

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.clone_annual_review_template(uuid, text) TO authenticated;

-- 6) Cycle cloning (optionally carry templates + rules forward)
CREATE OR REPLACE FUNCTION public.clone_annual_review_cycle(
  p_source_id     uuid,
  p_new_name      text,
  p_review_year   integer,
  p_copy_templates boolean DEFAULT false,
  p_copy_rules    boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_id uuid;
  v_template_map jsonb := '{}'::jsonb;
  r record;
  v_new_tpl uuid;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may clone cycles';
  END IF;
  IF p_new_name IS NULL OR length(btrim(p_new_name)) = 0 THEN
    RAISE EXCEPTION 'new cycle name is required';
  END IF;

  INSERT INTO public.annual_review_cycles(
    name, review_year, description, status, created_by
  )
  SELECT btrim(p_new_name), p_review_year, description, 'draft', v_caller
    FROM public.annual_review_cycles WHERE id = p_source_id
  RETURNING id INTO v_new_id;

  IF p_copy_templates THEN
    FOR r IN
      SELECT DISTINCT r.template_id
        FROM public.annual_review_assignment_rules r
       WHERE r.cycle_id = p_source_id AND r.template_id IS NOT NULL
    LOOP
      v_new_tpl := public.clone_annual_review_template(r.template_id, NULL);
      v_template_map := v_template_map || jsonb_build_object(r.template_id::text, v_new_tpl::text);
    END LOOP;
  END IF;

  IF p_copy_rules THEN
    INSERT INTO public.annual_review_assignment_rules(
      cycle_id, template_id, name, priority, filters, is_active
    )
    SELECT v_new_id,
           CASE
             WHEN p_copy_templates AND v_template_map ? template_id::text
               THEN (v_template_map ->> template_id::text)::uuid
             ELSE template_id
           END,
           name, priority, filters, is_active
      FROM public.annual_review_assignment_rules
     WHERE cycle_id = p_source_id;
  END IF;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.cycle_cloned', v_caller, jsonb_build_object(
    'source_id', p_source_id, 'new_id', v_new_id,
    'copy_templates', p_copy_templates, 'copy_rules', p_copy_rules
  ));

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.clone_annual_review_cycle(uuid, text, integer, boolean, boolean) TO authenticated;

COMMENT ON FUNCTION public.acknowledge_annual_review_instance IS
  'Employee acknowledgment of a completed annual review, with optional rebuttal note. Audit-logged.';
COMMENT ON FUNCTION public.clone_annual_review_template IS
  'HR/Admin only. Clones an annual review template as the next version under the same root template lineage.';
COMMENT ON FUNCTION public.clone_annual_review_cycle IS
  'HR/Admin only. Clones an annual review cycle as draft, optionally re-cloning its templates and copying assignment rules.';

-- ============================================================
-- ADR-213: Master Change History capture + report RPC
-- ============================================================

-- 1) Broadened profile change audit ---------------------------
CREATE OR REPLACE FUNCTION public.log_profile_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fields text[] := ARRAY[
    'full_name','employee_code','email','is_active','employment_status',
    'department_id','designation','reporting_manager_id','functional_manager_id',
    'pms_grade','pms_grade_id','level','level_id','location_id',
    'employee_category','doj','group_doj','mobile_number','portal_access',
    'company_id','confirmation_date'
  ];
  v_field text;
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  v_before text;
  v_after  text;
BEGIN
  FOREACH v_field IN ARRAY v_fields LOOP
    v_before := v_old ->> v_field;
    v_after  := v_new ->> v_field;
    IF v_before IS DISTINCT FROM v_after THEN
      INSERT INTO public.system_audit_logs (action, performed_by, metadata)
      VALUES (
        'profile.field_changed',
        auth.uid(),
        jsonb_build_object(
          'profile_id', OLD.id,
          'field', v_field,
          'before', v_before,
          'after',  v_after
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- 2) Workflow mapping audit -----------------------------------
CREATE OR REPLACE FUNCTION public.log_workflow_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op text := lower(TG_OP);
  v_row record;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.workflow_template_id IS NOT DISTINCT FROM NEW.workflow_template_id
     AND OLD.config_type          IS NOT DISTINCT FROM NEW.config_type
     AND OLD.config_value         IS NOT DISTINCT FROM NEW.config_value
     AND OLD.review_period        IS NOT DISTINCT FROM NEW.review_period
     AND OLD.review_year          IS NOT DISTINCT FROM NEW.review_year
     AND OLD.is_ongoing           IS NOT DISTINCT FROM NEW.is_ongoing
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'workflow.mapping_changed',
    auth.uid(),
    jsonb_build_object(
      'op', v_op,
      'config_id', v_row.id,
      'config_type', v_row.config_type,
      'config_value', v_row.config_value,
      'review_period', v_row.review_period,
      'review_year', v_row.review_year,
      'is_ongoing', v_row.is_ongoing,
      'before_template_id', CASE WHEN TG_OP <> 'INSERT' THEN OLD.workflow_template_id END,
      'after_template_id',  CASE WHEN TG_OP <> 'DELETE' THEN NEW.workflow_template_id END
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_config_audit ON public.workflow_config;
CREATE TRIGGER trg_workflow_config_audit
AFTER INSERT OR UPDATE OR DELETE ON public.workflow_config
FOR EACH ROW EXECUTE FUNCTION public.log_workflow_config_change();

-- 3) Value resolver -------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_change_value(p_field text, p_value text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out text;
  v_uuid uuid;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;

  IF p_field IN ('is_active','portal_access') THEN
    RETURN CASE WHEN p_value IN ('true','t') THEN 'Yes' ELSE 'No' END;
  END IF;

  BEGIN
    v_uuid := p_value::uuid;
  EXCEPTION WHEN others THEN
    RETURN p_value;
  END;

  CASE p_field
    WHEN 'department_id' THEN SELECT name INTO v_out FROM public.departments WHERE id = v_uuid;
    WHEN 'level_id'      THEN SELECT name INTO v_out FROM public.levels WHERE id = v_uuid;
    WHEN 'location_id'   THEN SELECT name INTO v_out FROM public.locations WHERE id = v_uuid;
    WHEN 'pms_grade_id'  THEN SELECT name INTO v_out FROM public.pms_grades WHERE id = v_uuid;
    WHEN 'company_id'    THEN SELECT name INTO v_out FROM public.companies WHERE id = v_uuid;
    WHEN 'reporting_manager_id'  THEN SELECT full_name INTO v_out FROM public.profiles WHERE id = v_uuid;
    WHEN 'functional_manager_id' THEN SELECT full_name INTO v_out FROM public.profiles WHERE id = v_uuid;
    WHEN 'workflow_template'     THEN SELECT COALESCE(display_name, name) INTO v_out FROM public.workflow_templates WHERE id = v_uuid;
    ELSE v_out := NULL;
  END CASE;

  RETURN COALESCE(v_out, p_value);
END;
$$;

-- 4) Report RPC ------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_change_history(
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_categories  text[]      DEFAULT NULL,
  p_search      text        DEFAULT NULL,
  p_changed_by  uuid        DEFAULT NULL,
  p_department  uuid        DEFAULT NULL,
  p_limit       integer     DEFAULT 50,
  p_offset      integer     DEFAULT 0
)
RETURNS TABLE (
  event_id       text,
  occurred_at    timestamptz,
  category       text,
  employee_id    uuid,
  employee_name  text,
  employee_code  text,
  field_label    text,
  old_value      text,
  new_value      text,
  changed_by     uuid,
  changed_by_name text,
  context        text,
  total_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorized to read change history';
  END IF;

  RETURN QUERY
  WITH raw AS (
    -- Profile field changes (new format)
    SELECT
      sal.id::text                                        AS event_id,
      sal.created_at                                      AS occurred_at,
      CASE WHEN sal.metadata->>'field' IN ('is_active','employment_status')
           THEN 'status' ELSE 'employee_details' END      AS category,
      (sal.metadata->>'profile_id')::uuid                 AS employee_id,
      sal.metadata->>'field'                              AS field_key,
      public.resolve_change_value(sal.metadata->>'field', sal.metadata->>'before') AS old_value,
      public.resolve_change_value(sal.metadata->>'field', sal.metadata->>'after')  AS new_value,
      sal.performed_by                                    AS changed_by,
      NULL::text                                          AS context
    FROM public.system_audit_logs sal
    WHERE sal.action = 'profile.field_changed'

    UNION ALL
    -- Profile identity changes (legacy format, before ADR-213)
    SELECT
      sal.id::text || ':' || kv.key,
      sal.created_at,
      CASE WHEN kv.key = 'is_active' THEN 'status' ELSE 'employee_details' END,
      (sal.metadata->>'profile_id')::uuid,
      kv.key,
      public.resolve_change_value(kv.key, kv.value #>> '{}'),
      public.resolve_change_value(kv.key, (sal.metadata->'after'->kv.key) #>> '{}'),
      sal.performed_by,
      NULL::text
    FROM public.system_audit_logs sal
    CROSS JOIN LATERAL jsonb_each(COALESCE(sal.metadata->'before', '{}'::jsonb)) AS kv(key, value)
    WHERE sal.action = 'profile.identity_changed'
      AND kv.value IS DISTINCT FROM sal.metadata->'after'->kv.key

    UNION ALL
    -- Employment status history
    SELECT
      'esh:' || esh.id::text,
      esh.changed_at,
      'status',
      esh.employee_id,
      'employment_status',
      esh.previous_status,
      esh.new_status,
      esh.changed_by,
      NULLIF(esh.source, '') || COALESCE(' · ' || esh.notes, '')
    FROM public.employment_status_history esh

    UNION ALL
    -- Workflow mapping changes
    SELECT
      sal.id::text,
      sal.created_at,
      'workflow_mapping',
      CASE WHEN sal.metadata->>'config_type' = 'employee'
           THEN NULLIF(sal.metadata->>'config_value','')::uuid END,
      'workflow_mapping',
      public.resolve_change_value('workflow_template', sal.metadata->>'before_template_id'),
      public.resolve_change_value('workflow_template', sal.metadata->>'after_template_id'),
      sal.performed_by,
      initcap(COALESCE(sal.metadata->>'op','update')) || ' · '
        || COALESCE(sal.metadata->>'config_type','') || ' = '
        || COALESCE(
             CASE WHEN sal.metadata->>'config_type' = 'employee'
                  THEN (SELECT p.full_name FROM public.profiles p WHERE p.id = NULLIF(sal.metadata->>'config_value','')::uuid)
                  ELSE sal.metadata->>'config_value' END, '—')
        || COALESCE(' · ' || (sal.metadata->>'review_period') || ' ' || (sal.metadata->>'review_year'), ' · global')
    FROM public.system_audit_logs sal
    WHERE sal.action = 'workflow.mapping_changed'

    UNION ALL
    -- Annual review reviewer overrides
    SELECT
      'aro:' || o.id::text,
      o.created_at,
      'annual_review',
      i.employee_id,
      'reviewer_' || o.role,
      NULL::text,
      (SELECT p.full_name FROM public.profiles p WHERE p.id = o.new_reviewer_id),
      o.created_by,
      o.reason
    FROM public.annual_review_assignment_overrides o
    JOIN public.annual_review_instances i ON i.id = o.instance_id

    UNION ALL
    -- Annual review template overrides / resets logged in audit
    SELECT
      sal.id::text,
      sal.created_at,
      'annual_review',
      NULLIF(sal.metadata->>'employee_id','')::uuid,
      replace(sal.action, 'annual_review.', ''),
      NULL::text,
      NULL::text,
      sal.performed_by,
      NULL::text
    FROM public.system_audit_logs sal
    WHERE sal.action IN (
      'annual_review.template_override_set',
      'annual_review.instance_force_reset',
      'annual_review.instance.excluded',
      'annual_review.instance.restored',
      'annual_review.send_back'
    )
  ),
  joined AS (
    SELECT
      r.*,
      pe.full_name     AS employee_name,
      pe.employee_code AS employee_code,
      pe.department_id AS employee_department,
      pb.full_name     AS changed_by_name
    FROM raw r
    LEFT JOIN public.profiles pe ON pe.id = r.employee_id
    LEFT JOIN public.profiles pb ON pb.id = r.changed_by
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE (p_from IS NULL OR j.occurred_at >= p_from)
      AND (p_to   IS NULL OR j.occurred_at <  p_to)
      AND (p_categories IS NULL OR array_length(p_categories,1) IS NULL OR j.category = ANY(p_categories))
      AND (p_changed_by IS NULL OR j.changed_by = p_changed_by)
      AND (p_department IS NULL OR j.employee_department = p_department)
      AND (
        p_search IS NULL OR p_search = ''
        OR j.employee_name ILIKE '%' || p_search || '%'
        OR j.employee_code ILIKE '%' || p_search || '%'
        OR j.changed_by_name ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (SELECT count(*) AS n FROM filtered)
  SELECT
    f.event_id,
    f.occurred_at,
    f.category,
    f.employee_id,
    f.employee_name,
    f.employee_code,
    f.field_key,
    f.old_value,
    f.new_value,
    f.changed_by,
    f.changed_by_name,
    f.context,
    c.n
  FROM filtered f CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset,0),0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_change_history(timestamptz,timestamptz,text[],text,uuid,uuid,integer,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_change_history(timestamptz,timestamptz,text[],text,uuid,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_change_value(text,text) TO authenticated;
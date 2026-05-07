-- ADR-062: enrich Org KPI Data Entry snapshot with display maps so the
-- scoped editor can render real names/departments without depending on the
-- caller's profiles RLS visibility (which can legitimately omit a mapped
-- employee for non-admin readers / paged-query races).

CREATE OR REPLACE FUNCTION public.get_org_kpi_data_entry_snapshot(
  p_period text,
  p_year   integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full_reader boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'kpis', '[]'::jsonb, 'unmappedCount', 0, 'totalOrgKpis', 0,
      'perEmployeeTargetMap', '{}'::jsonb, 'employeeKpiIdsMap', '{}'::jsonb,
      'kraSetKpiRowsByKey', '{}'::jsonb, 'kraSetEmpIdsByKey', '{}'::jsonb,
      'mappedEmpIdsByKey', '{}'::jsonb,
      'employeeDisplayMap', '{}'::jsonb,
      'departmentDisplayMap', '{}'::jsonb
    );
  END IF;

  v_is_full_reader :=
       public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'auditor'::public.app_role)
    OR public.has_role(v_uid, 'management'::public.app_role)
    OR public.has_role(v_uid, 'hr_pms'::public.app_role);

  WITH base AS (
    SELECT
      k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
      k.review_period, k.review_year, k.frequency, k.frequency_cycle_start,
      k.is_org_level, k.org_level_scope, k.status, k.target_value, k.uom,
      k.criteria, k.uom_type, k.qualitative_options, k.threshold_mode,
      k.r5, k.r4, k.r3, k.r2, k.r1, k.r0, k.weightage,
      p.department_id AS emp_department_id,
      COALESCE(p.is_active, true) AS emp_active,
      k.category_id::text
        || '||' || public.normalize_kpi_text(k.kra_name)
        || '||' || public.normalize_kpi_text(k.kpi_name) AS def_key
    FROM public.kpis k
    LEFT JOIN public.profiles p ON p.id = k.employee_id
    WHERE k.is_org_level = true
      AND k.review_period = p_period
      AND k.review_year   = p_year
      AND (
        v_is_full_reader
        OR EXISTS (
          SELECT 1 FROM public.org_kpi_data_owners o
          WHERE o.owner_id = v_uid
            AND o.category_id = k.category_id
            AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
            AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
        )
      )
  ),
  rep AS (
    SELECT DISTINCT ON (def_key)
      def_key, id, employee_id, category_id, kra_name, kpi_name,
      review_period, review_year, frequency, frequency_cycle_start,
      is_org_level, org_level_scope, status, target_value, uom,
      criteria, uom_type, qualitative_options, threshold_mode,
      r5, r4, r3, r2, r1, r0, weightage
    FROM base
    ORDER BY def_key, category_id, kra_name, kpi_name, id
  ),
  agg AS (
    SELECT
      def_key,
      COUNT(*) FILTER (WHERE emp_active) AS active_emp_rows,
      COUNT(DISTINCT employee_id) FILTER (WHERE emp_active AND employee_id IS NOT NULL) AS employee_count,
      COALESCE(
        (SELECT jsonb_agg(DISTINCT eid)
           FROM (SELECT employee_id AS eid FROM base b2
                  WHERE b2.def_key = base.def_key
                    AND b2.emp_active AND b2.employee_id IS NOT NULL) s),
        '[]'::jsonb
      ) AS employee_ids,
      COALESCE(
        (SELECT jsonb_agg(DISTINCT did)
           FROM (SELECT emp_department_id AS did FROM base b3
                  WHERE b3.def_key = base.def_key
                    AND b3.emp_active AND b3.emp_department_id IS NOT NULL) s),
        '[]'::jsonb
      ) AS department_ids,
      COALESCE(
        (SELECT jsonb_agg(b4.id)
           FROM base b4
          WHERE b4.def_key = base.def_key AND b4.status = 'kra_set'),
        '[]'::jsonb
      ) AS kra_set_kpi_rows,
      COALESCE(
        (SELECT jsonb_agg(DISTINCT b5.employee_id)
           FROM base b5
          WHERE b5.def_key = base.def_key
            AND b5.status = 'kra_set'
            AND b5.employee_id IS NOT NULL),
        '[]'::jsonb
      ) AS kra_set_emp_ids,
      COALESCE(
        (SELECT jsonb_object_agg(
                  base.def_key || '||' || (b6.employee_id::text),
                  jsonb_build_object('target_value', b6.target_value, 'uom', b6.uom)
                )
           FROM (
             SELECT DISTINCT ON (employee_id) employee_id, target_value, uom
               FROM base bb WHERE bb.def_key = base.def_key AND bb.employee_id IS NOT NULL
              ORDER BY employee_id, id
           ) b6),
        '{}'::jsonb
      ) AS per_employee_targets,
      COALESCE(
        (SELECT jsonb_agg(b7.id)
           FROM base b7
          WHERE b7.def_key = base.def_key
            AND b7.org_level_scope = 'employee'),
        '[]'::jsonb
      ) AS employee_kpi_ids
    FROM base
    GROUP BY def_key
  ),
  cats AS (
    SELECT id, name, color, weightage FROM public.kra_categories
     WHERE id IN (SELECT DISTINCT category_id FROM rep)
  ),
  mapped_emp_ids AS (
    SELECT DISTINCT employee_id AS id
      FROM base
     WHERE emp_active AND employee_id IS NOT NULL
  ),
  mapped_dept_ids AS (
    SELECT DISTINCT emp_department_id AS id
      FROM base
     WHERE emp_active AND emp_department_id IS NOT NULL
  ),
  emp_display AS (
    SELECT jsonb_object_agg(
             p.id::text,
             jsonb_build_object(
               'full_name', p.full_name,
               'employee_code', p.employee_code,
               'designation', p.designation,
               'department_id', p.department_id,
               'department_name', d.name,
               'department_code', d.code,
               'is_active', p.is_active
             )
           ) AS map
      FROM public.profiles p
      LEFT JOIN public.departments d ON d.id = p.department_id
     WHERE p.id IN (SELECT id FROM mapped_emp_ids)
  ),
  dept_display AS (
    SELECT jsonb_object_agg(
             d.id::text,
             jsonb_build_object('name', d.name, 'code', d.code)
           ) AS map
      FROM public.departments d
     WHERE d.id IN (SELECT id FROM mapped_dept_ids)
  )
  SELECT jsonb_build_object(
    'kpis', COALESCE(jsonb_agg(
              jsonb_build_object(
                'kpi', to_jsonb(rep) - 'def_key' || jsonb_build_object(
                  'kra_categories', COALESCE(
                    (SELECT to_jsonb(c) FROM cats c WHERE c.id = rep.category_id),
                    'null'::jsonb)
                ),
                'employeeCount', agg.employee_count,
                'departmentIds', agg.department_ids,
                'employeeIds',   agg.employee_ids
              )
            ) FILTER (WHERE agg.employee_count >= 1), '[]'::jsonb),
    'unmappedCount', COALESCE(SUM(CASE WHEN agg.employee_count < 1 THEN 1 ELSE 0 END), 0),
    'totalOrgKpis',  COUNT(*),
    'perEmployeeTargetMap', COALESCE(
      (SELECT jsonb_object_agg(k, v)
         FROM (SELECT (jsonb_each(per_employee_targets)).* FROM agg) t(k, v)),
      '{}'::jsonb),
    'employeeKpiIdsMap', COALESCE(
      (SELECT jsonb_object_agg(def_key, employee_kpi_ids)
         FROM agg WHERE jsonb_array_length(employee_kpi_ids) > 0),
      '{}'::jsonb),
    'kraSetKpiRowsByKey', COALESCE(
      (SELECT jsonb_object_agg(def_key, kra_set_kpi_rows)
         FROM agg WHERE jsonb_array_length(kra_set_kpi_rows) > 0),
      '{}'::jsonb),
    'kraSetEmpIdsByKey', COALESCE(
      (SELECT jsonb_object_agg(def_key, kra_set_emp_ids)
         FROM agg WHERE jsonb_array_length(kra_set_emp_ids) > 0),
      '{}'::jsonb),
    'mappedEmpIdsByKey', COALESCE(
      (SELECT jsonb_object_agg(def_key, employee_ids)
         FROM agg WHERE jsonb_array_length(employee_ids) > 0),
      '{}'::jsonb),
    'employeeDisplayMap', COALESCE((SELECT map FROM emp_display), '{}'::jsonb),
    'departmentDisplayMap', COALESCE((SELECT map FROM dept_display), '{}'::jsonb)
  )
  INTO v_result
  FROM rep
  JOIN agg USING (def_key);

  RETURN COALESCE(v_result, jsonb_build_object(
    'kpis', '[]'::jsonb, 'unmappedCount', 0, 'totalOrgKpis', 0,
    'perEmployeeTargetMap', '{}'::jsonb, 'employeeKpiIdsMap', '{}'::jsonb,
    'kraSetKpiRowsByKey', '{}'::jsonb, 'kraSetEmpIdsByKey', '{}'::jsonb,
    'mappedEmpIdsByKey', '{}'::jsonb,
    'employeeDisplayMap', '{}'::jsonb,
    'departmentDisplayMap', '{}'::jsonb
  ));
END;
$$;
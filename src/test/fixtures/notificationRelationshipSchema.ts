export const notificationRelationshipSchema = {
  p: ['id', 'reporting_manager_id', 'functional_manager_id', 'department_id'],
  mgr: ['id', 'reporting_manager_id'],
  d: ['id', 'business_unit_id', 'head_user_id'],
  bu: ['id', 'head_user_id'],
  a: ['auditor_id', 'employee_id'],
  la: ['auditor_id', 'kpi_id'],
  k: ['id', 'employee_id'],
  i: ['id', 'employee_id', 'manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id'],
  ps: ['instance_id', 'proxy_user_id'],
} as const;

export const notificationRelationshipSqlFixtures = {
  valid: `
    FROM public.profiles p
    LEFT JOIN public.profiles mgr ON mgr.id = p.reporting_manager_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    FROM public.audit_kpi_assignments a
    FROM public.audit_kpi_level_assignments la
    JOIN public.kpis k ON k.id = la.kpi_id
    FROM public.annual_review_instances i
    FROM public.annual_review_proxy_submissions ps
    JOIN public.annual_review_instances i ON i.id = ps.instance_id
  `,
  invalidLegacyKpi: `
    FROM public.kpis k
    WHERE k.employee_id = target
      AND (k.assigned_to = target OR k.manager_id = sender)
  `,
  validBidirectionalAnnualReview: `
    FROM public.annual_review_instances i
    WHERE (i.employee_id = sender AND target IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
       OR (sender IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
           AND target IN (i.employee_id, i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
  `,
} as const;
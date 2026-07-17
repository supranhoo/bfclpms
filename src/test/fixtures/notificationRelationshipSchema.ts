export const notificationRelationshipSchema = {
  p: ['id', 'reporting_manager_id', 'functional_manager_id', 'department_id'],
  mgr: ['id', 'reporting_manager_id'],
  d: ['id', 'business_unit_id', 'head_user_id'],
  bu: ['id', 'head_user_id'],
  a: ['auditor_id', 'employee_id'],
  i: ['employee_id', 'manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id'],
} as const;

export const notificationRelationshipSqlFixtures = {
  valid: `
    FROM public.profiles p
    LEFT JOIN public.profiles mgr ON mgr.id = p.reporting_manager_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    FROM public.audit_kpi_assignments a
    FROM public.annual_review_instances i
  `,
  invalidLegacyKpi: `
    FROM public.kpis k
    WHERE k.employee_id = target
      AND (k.assigned_to = target OR k.manager_id = sender)
  `,
} as const;
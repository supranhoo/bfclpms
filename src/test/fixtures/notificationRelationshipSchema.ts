export const notificationRelationshipSchema = {
  p: ['id', 'reporting_manager_id', 'functional_manager_id', 'department_id'],
  mgr: ['id', 'reporting_manager_id'],
  d: ['id', 'business_unit_id', 'head_user_id'],
  bu: ['id', 'head_user_id'],
  a: ['auditor_id', 'employee_id'],
  i: ['employee_id', 'manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id'],
} as const;
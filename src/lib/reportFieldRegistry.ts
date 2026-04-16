/**
 * Central registry of available data source fields for the Custom Report Builder.
 * Each field maps to a Supabase table/column with join information.
 */

export interface ReportFieldDef {
  key: string;          // unique key e.g. "employee.full_name"
  source: string;       // data source group
  field: string;        // column name in source table
  label: string;        // display label
  type: 'text' | 'number' | 'date' | 'boolean';
  table: string;        // primary table
  joinPath?: string;    // optional join description
}

export const REPORT_FIELD_SOURCES = [
  'Employee',
  'Organization',
  'KPI',
  'Scores',
  'Achieved Values',
  'Workflow',
] as const;

export type ReportFieldSource = typeof REPORT_FIELD_SOURCES[number];

export const REPORT_FIELD_REGISTRY: ReportFieldDef[] = [
  // Employee
  { key: 'employee.employee_code', source: 'Employee', field: 'employee_code', label: 'Employee Code', type: 'text', table: 'profiles' },
  { key: 'employee.full_name', source: 'Employee', field: 'full_name', label: 'Full Name', type: 'text', table: 'profiles' },
  { key: 'employee.email', source: 'Employee', field: 'email', label: 'Email', type: 'text', table: 'profiles' },
  { key: 'employee.designation', source: 'Employee', field: 'designation', label: 'Designation', type: 'text', table: 'profiles' },
  { key: 'employee.pms_grade', source: 'Employee', field: 'pms_grade', label: 'PMS Grade', type: 'text', table: 'profiles' },
  { key: 'employee.joining_date', source: 'Employee', field: 'joining_date', label: 'Joining Date', type: 'date', table: 'profiles' },
  { key: 'employee.is_active', source: 'Employee', field: 'is_active', label: 'Is Active', type: 'boolean', table: 'profiles' },

  // Organization
  { key: 'org.division', source: 'Organization', field: 'name', label: 'Division', type: 'text', table: 'divisions', joinPath: 'profiles.division_id → divisions.id' },
  { key: 'org.business_unit', source: 'Organization', field: 'name', label: 'Business Unit', type: 'text', table: 'business_units', joinPath: 'profiles.business_unit_id → business_units.id' },
  { key: 'org.department', source: 'Organization', field: 'name', label: 'Department', type: 'text', table: 'departments', joinPath: 'profiles.department_id → departments.id' },

  // KPI
  { key: 'kpi.kra_name', source: 'KPI', field: 'kra_name', label: 'KRA Name', type: 'text', table: 'kpis' },
  { key: 'kpi.kpi_name', source: 'KPI', field: 'kpi_name', label: 'KPI Name', type: 'text', table: 'kpis' },
  { key: 'kpi.category', source: 'KPI', field: 'category', label: 'Category', type: 'text', table: 'kpis', joinPath: 'kpis.category_id → kpi_categories.id' },
  { key: 'kpi.weightage', source: 'KPI', field: 'weightage', label: 'Weightage', type: 'number', table: 'kpis' },
  { key: 'kpi.frequency', source: 'KPI', field: 'frequency', label: 'Frequency', type: 'text', table: 'kpis' },
  { key: 'kpi.status', source: 'KPI', field: 'status', label: 'Status', type: 'text', table: 'kpis' },
  { key: 'kpi.review_period', source: 'KPI', field: 'review_period', label: 'Review Period', type: 'text', table: 'kpis' },
  { key: 'kpi.review_year', source: 'KPI', field: 'review_year', label: 'Review Year', type: 'number', table: 'kpis' },
  { key: 'kpi.is_org_level', source: 'KPI', field: 'is_org_level', label: 'Org Level', type: 'boolean', table: 'kpis' },
  { key: 'kpi.is_na', source: 'KPI', field: 'is_na', label: 'N/A', type: 'boolean', table: 'kpis' },

  // Scores
  { key: 'scores.self_score', source: 'Scores', field: 'self_score', label: 'Self Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.manager_score', source: 'Scores', field: 'manager_score', label: 'Manager Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.skip_level_score', source: 'Scores', field: 'skip_level_score', label: 'Skip-Level Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.hr_pms_score', source: 'Scores', field: 'hr_pms_score', label: 'HR PMS Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.auditor_score', source: 'Scores', field: 'auditor_score', label: 'Auditor Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.management_score', source: 'Scores', field: 'management_score', label: 'Management Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.final_score', source: 'Scores', field: 'final_score', label: 'Final Score', type: 'number', table: 'review_submissions' },
  { key: 'scores.self_rating', source: 'Scores', field: 'self_rating', label: 'Self Rating', type: 'text', table: 'review_submissions' },
  { key: 'scores.manager_rating', source: 'Scores', field: 'manager_rating', label: 'Manager Rating', type: 'text', table: 'review_submissions' },
  { key: 'scores.final_rating', source: 'Scores', field: 'final_rating', label: 'Final Rating', type: 'text', table: 'review_submissions' },

  // Achieved Values
  { key: 'achieved.self', source: 'Achieved Values', field: 'achieved_value', label: 'Self Achieved', type: 'number', table: 'review_submissions' },
  { key: 'achieved.manager', source: 'Achieved Values', field: 'manager_achieved_value', label: 'Manager Achieved', type: 'number', table: 'review_submissions' },
  { key: 'achieved.auditor', source: 'Achieved Values', field: 'auditor_achieved_value', label: 'Auditor Achieved', type: 'number', table: 'review_submissions' },
  { key: 'achieved.management', source: 'Achieved Values', field: 'management_achieved_value', label: 'Mgmt Achieved', type: 'number', table: 'review_submissions' },

  // Workflow
  { key: 'workflow.submitted_at', source: 'Workflow', field: 'submitted_at', label: 'Submitted At', type: 'date', table: 'review_submissions' },
  { key: 'workflow.assigned_at', source: 'Workflow', field: 'assigned_at', label: 'Assigned At', type: 'date', table: 'kpis' },
];

export function getFieldsBySource(source: ReportFieldSource): ReportFieldDef[] {
  return REPORT_FIELD_REGISTRY.filter(f => f.source === source);
}

export function getFieldByKey(key: string): ReportFieldDef | undefined {
  return REPORT_FIELD_REGISTRY.find(f => f.key === key);
}

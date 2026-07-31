/**
 * ADR-213 / POLICY §CHG-HISTORY-SSOT
 *
 * Presentation helpers for the Master Change History report. Pure functions
 * only — no data access — so the labelling contract is unit-testable and the
 * report page stays a rendering surface.
 */

export type ChangeCategory =
  | 'employee_details'
  | 'status'
  | 'workflow_mapping'
  | 'annual_review';

export interface ChangeHistoryRow {
  event_id: string;
  occurred_at: string;
  category: ChangeCategory | string;
  employee_id: string | null;
  employee_name: string | null;
  employee_code: string | null;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  context: string | null;
  total_count: number;
}

export const CATEGORY_LABEL: Record<string, string> = {
  employee_details: 'Employee Details',
  status: 'Active / Status',
  workflow_mapping: 'Workflow Mapping',
  annual_review: 'Annual Review',
};

export const CATEGORY_OPTIONS: { value: ChangeCategory; label: string }[] = [
  { value: 'employee_details', label: CATEGORY_LABEL.employee_details },
  { value: 'status', label: CATEGORY_LABEL.status },
  { value: 'workflow_mapping', label: CATEGORY_LABEL.workflow_mapping },
  { value: 'annual_review', label: CATEGORY_LABEL.annual_review },
];

const FIELD_LABEL: Record<string, string> = {
  full_name: 'Full Name',
  employee_code: 'Employee Code',
  email: 'Email',
  is_active: 'Active',
  employment_status: 'Employment Status',
  department_id: 'Department',
  designation: 'Designation',
  reporting_manager_id: 'Reporting Manager',
  functional_manager_id: 'Functional Manager',
  pms_grade: 'PMS Grade',
  pms_grade_id: 'PMS Grade',
  level: 'Level',
  level_id: 'Level',
  location_id: 'Location',
  employee_category: 'Employee Category',
  doj: 'Date of Joining',
  group_doj: 'Group Date of Joining',
  mobile_number: 'Mobile Number',
  portal_access: 'Portal Access',
  company_id: 'Company',
  confirmation_date: 'Confirmation Date',
  workflow_mapping: 'Workflow Template',
  'instance.excluded': 'Review Excluded',
  'instance.restored': 'Review Restored',
  instance_force_reset: 'Review Force Reset',
  template_override_set: 'Review Template Override',
  send_back: 'Review Sent Back',
};

/** Human label for a raw field key, falling back to a title-cased form. */
export function fieldLabel(key: string | null | undefined): string {
  if (!key) return '—';
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  if (key.startsWith('reviewer_')) {
    return `Reviewer — ${titleCase(key.slice('reviewer_'.length))}`;
  }
  return titleCase(key);
}

function titleCase(s: string): string {
  return s.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display value; never leaks an empty string into the table. */
export function displayValue(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return v;
}

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? titleCase(c);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

/** Row shape used by the Excel export — keeps UI and export in lockstep. */
export function toExportRow(r: ChangeHistoryRow): Record<string, string> {
  return {
    'Date & Time': formatWhen(r.occurred_at),
    'Category': categoryLabel(r.category),
    'Employee Code': displayValue(r.employee_code),
    'Employee': displayValue(r.employee_name),
    'What Changed': fieldLabel(r.field_label),
    'Old Value': displayValue(r.old_value),
    'New Value': displayValue(r.new_value),
    'Changed By': r.changed_by_name ?? (r.changed_by ? 'System user' : 'System'),
    'Context': displayValue(r.context),
  };
}

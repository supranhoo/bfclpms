/**
 * Employee Master Field Requirements — SSOT
 * -----------------------------------------
 * Drives which fields on the Add New User page are mandatory.
 * Stored under system_settings.employee_master_field_requirements.
 */

export type EmployeeMasterFieldKey =
  | 'full_name'
  | 'email'
  | 'employee_code'
  | 'group_doj'
  | 'doj'
  | 'confirmation_date'
  | 'company_id'
  | 'division_id'
  | 'department_id'
  | 'designation'
  | 'pms_grade'
  | 'employee_category'
  | 'employment_status'
  | 'location_id'
  | 'reporting_manager_id'
  | 'role'
  | 'portal_access'
  | 'mobile_number'
  | 'is_dummy_employee';

export interface EmployeeMasterFieldDef {
  key: EmployeeMasterFieldKey;
  label: string;
  alwaysRequired?: boolean;
}

export const EMPLOYEE_MASTER_FIELDS: EmployeeMasterFieldDef[] = [
  { key: 'full_name', label: 'Full Name', alwaysRequired: true },
  { key: 'employee_code', label: 'Employee Code', alwaysRequired: true },
  { key: 'email', label: 'Email' },
  { key: 'group_doj', label: 'Group Date of Joining (GDOJ)' },
  { key: 'doj', label: 'Date of Joining (DOJ)' },
  { key: 'confirmation_date', label: 'Confirmation Date' },
  { key: 'company_id', label: 'Company' },
  { key: 'division_id', label: 'Division' },
  { key: 'department_id', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'pms_grade', label: 'PMS Grade' },
  { key: 'employee_category', label: 'Employee Category' },
  { key: 'employment_status', label: 'Employment Status' },
  { key: 'location_id', label: 'Location' },
  { key: 'reporting_manager_id', label: 'Reporting Manager' },
  { key: 'role', label: 'Role' },
  { key: 'portal_access', label: 'Portal Access' },
  { key: 'mobile_number', label: 'Mobile Number' },
  { key: 'is_dummy_employee', label: 'Dummy/System Employee' },
];

export type EmployeeMasterFieldRequirements = Record<EmployeeMasterFieldKey, boolean>;

export const DEFAULT_REQUIREMENTS: EmployeeMasterFieldRequirements =
  EMPLOYEE_MASTER_FIELDS.reduce((acc, f) => {
    acc[f.key] = !!f.alwaysRequired;
    return acc;
  }, {} as EmployeeMasterFieldRequirements);

export function parseRequirements(raw: unknown): EmployeeMasterFieldRequirements {
  const merged: EmployeeMasterFieldRequirements = { ...DEFAULT_REQUIREMENTS };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const f of EMPLOYEE_MASTER_FIELDS) {
      const v = obj[f.key];
      if (typeof v === 'boolean') merged[f.key] = v;
    }
  }
  // Always-required keys cannot be turned off.
  for (const f of EMPLOYEE_MASTER_FIELDS) {
    if (f.alwaysRequired) merged[f.key] = true;
  }
  return merged;
}

export type FieldValueMap = Partial<Record<EmployeeMasterFieldKey, unknown>>;

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'boolean') return false; // booleans (e.g. portal_access) count as provided
  return false;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; fieldKey: EmployeeMasterFieldKey; label: string; message: string };

export function validateRequiredFields(
  values: FieldValueMap,
  reqs: EmployeeMasterFieldRequirements,
): ValidationResult {
  for (const f of EMPLOYEE_MASTER_FIELDS) {
    if (!reqs[f.key]) continue;
    if (isBlank(values[f.key])) {
      return {
        ok: false,
        fieldKey: f.key,
        label: f.label,
        message: `${f.label} is mandatory.`,
      };
    }
  }
  return { ok: true };
}
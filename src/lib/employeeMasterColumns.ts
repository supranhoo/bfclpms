/**
 * Employee Master column & import SSOT (ADR-247, POLICY §EMP-MASTER-COLUMN-PARITY)
 * --------------------------------------------------------------------------------
 * Every Employee Master attribute must be:
 *   1. visible (or selectable) in the User Management grid,
 *   2. documented + parsable in the Employee bulk import,
 *   3. present in the downloadable template and in "Export Current Data".
 *
 * Adding a new master attribute means adding it HERE, not in the page files.
 */

/** Optional grid columns (the fixed ones — user, code, dept, designation,
 *  grade, mobile, role, status, reporting-to, actions — always render). */
export const OPTIONAL_GRID_COLUMNS = [
  { key: 'functional_manager', label: 'Functional Manager (F1)' },
  { key: 'company', label: 'Company' },
  { key: 'division', label: 'Division' },
  { key: 'business_unit', label: 'Business Unit' },
  { key: 'location', label: 'Location' },
  { key: 'employee_category', label: 'Employee Category' },
  { key: 'employment_status', label: 'Employment Status' },
  { key: 'level', label: 'Level' },
  { key: 'group_doj', label: 'Group DOJ' },
  { key: 'doj', label: 'Date of Joining' },
  { key: 'confirmation_date', label: 'Confirmation Date' },
  { key: 'portal_access', label: 'Portal Access' },
  { key: 'is_dummy_employee', label: 'Dummy / System' },
] as const;

export type OptionalGridColumnKey = (typeof OPTIONAL_GRID_COLUMNS)[number]['key'];

export const OPTIONAL_GRID_COLUMN_KEYS: OptionalGridColumnKey[] =
  OPTIONAL_GRID_COLUMNS.map((c) => c.key);

/** Custom-field grid column keys are namespaced so they cannot collide. */
export const CUSTOM_COLUMN_PREFIX = 'cf:';
export const customColumnKey = (fieldKey: string) => `${CUSTOM_COLUMN_PREFIX}${fieldKey}`;
export const isCustomColumnKey = (key: string) => key.startsWith(CUSTOM_COLUMN_PREFIX);
export const customFieldKeyOf = (key: string) => key.slice(CUSTOM_COLUMN_PREFIX.length);

export const GRID_COLUMNS_STORAGE_KEY = 'employee-master-visible-columns';

export function parseStoredColumns(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function loadVisibleColumns(): string[] {
  if (typeof window === 'undefined') return [];
  return parseStoredColumns(window.localStorage.getItem(GRID_COLUMNS_STORAGE_KEY));
}

export function saveVisibleColumns(keys: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GRID_COLUMNS_STORAGE_KEY, JSON.stringify(keys));
}

/** Extra `profiles` columns the grid needs beyond the slim roster RPC. */
export const GRID_EXTRA_PROFILE_COLUMNS = [
  'id',
  'mobile_number',
  'portal_access',
  'is_dummy_employee',
  'location_id',
  'employee_category',
  'employment_status',
  'group_doj',
  'doj',
  'confirmation_date',
] as const;

export const GRID_EXTRA_PROFILE_SELECT = GRID_EXTRA_PROFILE_COLUMNS.join(', ');

/* ------------------------------------------------------------------ */
/* Import / export column contract                                     */
/* ------------------------------------------------------------------ */

export interface ImportColumnDoc {
  /** Canonical header written by the template & export. */
  key: string;
  /** Additional accepted headers (documented for users). */
  aliases?: string[];
  label: string;
  hint?: string;
  required?: boolean;
}

export const EMPLOYEE_IMPORT_COLUMNS: ImportColumnDoc[] = [
  { key: 'employeeCode', label: 'Unique Employee Code', required: true },
  { key: 'fullName', label: 'Employee Full Name', required: true },
  { key: 'email', label: 'Employee Email (used for login)', required: true },
  { key: 'designation', label: 'Job Title' },
  { key: 'role', label: 'System Role', hint: 'admin | manager | employee | auditor | management' },
  { key: 'companyCode', aliases: ['company'], label: 'Company Code or Name (must exist in master)' },
  { key: 'division', label: 'Division Name' },
  { key: 'businessUnit', label: 'Business Unit Name' },
  { key: 'department', label: 'Department Name (must exist in system)' },
  { key: 'pmsGrade', label: 'PMS Grade' },
  { key: 'level', label: 'Employee Level' },
  { key: 'employeeCategory', label: 'Employee Category (must exist in master)' },
  {
    key: 'employmentStatus',
    label: 'Employment Status',
    hint: 'e.g. Probation, Trainee, Confirmed, Superannuated, Retainer',
  },
  { key: 'location', label: 'Work Location Name (must exist in Locations master; case-insensitive)' },
  { key: 'portalAccess', label: 'Portal Login Access', hint: 'Yes/No, default: Yes if email provided' },
  { key: 'employeeStatus', label: 'Employee Status', hint: 'Active / Inactive' },
  { key: 'mobileNumber', aliases: ['mobile', 'phone', 'contactNumber'], label: 'Mobile Number' },
  {
    key: 'isDummyEmployee',
    aliases: ['dummyEmployee', 'systemEmployee'],
    label: 'Dummy / System employee',
    hint: 'Yes/No, default No',
  },
  { key: 'managerEmployeeId', label: "Manager's Employee Code" },
  { key: 'managerName', label: "Manager's Full Name" },
  {
    key: 'functionalManagerEmployeeId',
    aliases: ['functional_manager_code'],
    label: "Functional Manager's Employee Code",
    hint: 'optional; used by Functional Manager review stage',
  },
  {
    key: 'functionalManagerName',
    aliases: ['functional_manager'],
    label: "Functional Manager's Full Name",
    hint: 'optional; falls back when code is blank',
  },
  { key: 'groupDoj', aliases: ['gdoj'], label: 'Group Date of Joining (yyyy-MM-dd or dd/MM/yyyy)' },
  { key: 'doj', aliases: ['dateOfJoining'], label: 'Date of Joining (yyyy-MM-dd or dd/MM/yyyy)' },
  { key: 'confirmationDate', label: 'Confirmation Date (yyyy-MM-dd or dd/MM/yyyy)' },
];

/** Yes/No parser shared by importer columns (portalAccess, isDummyEmployee). */
export function parseYesNo(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim().toLowerCase();
  if (!s) return undefined;
  if (['yes', 'y', 'true', '1', 'active'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'inactive'].includes(s)) return false;
  return undefined;
}

/** Loose mobile validation — digits, spaces, +, -, (), 6..20 chars. */
export function isValidMobile(value: string): boolean {
  const s = value.trim();
  if (!s) return true;
  if (!/^[0-9+\-()\s]{6,20}$/.test(s)) return false;
  return (s.match(/\d/g) || []).length >= 6;
}

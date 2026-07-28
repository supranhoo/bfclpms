/**
 * Pure helpers for the Bulk Review designation / grade / reporting-manager
 * filters. Kept dependency-free so they're easy to unit-test.
 *
 * `BLANK` is the sentinel option value we surface in the dropdowns so users
 * can explicitly filter the "(blank)" bucket (rows whose profile attribute
 * is NULL / empty). Mirrors the convention already used by the KRA filter.
 */

export const BLANK_SENTINEL = '__blank__';

export interface EmpAttrs {
  designation: string | null;
  pms_grade: string | null;
  reporting_manager_id: string | null;
}

function matches(selected: string[], value: string | null): boolean {
  if (selected.length === 0) return true;
  const v = value == null || value === '' ? BLANK_SENTINEL : value;
  return selected.includes(v);
}

/**
 * Returns the set of employee ids that satisfy ALL three selections.
 * Empty selections mean "no constraint" for that axis (pass-through).
 */
export function allowedEmployeeIds(
  attrsByEmp: ReadonlyMap<string, EmpAttrs>,
  designations: string[],
  grades: string[],
  managerIds: string[],
): Set<string> {
  const out = new Set<string>();
  attrsByEmp.forEach((a, empId) => {
    if (!matches(designations, a.designation)) return;
    if (!matches(grades, a.pms_grade)) return;
    if (!matches(managerIds, a.reporting_manager_id)) return;
    out.add(empId);
  });
  return out;
}

/** Distinct, sorted option list for a given attribute key. */
export function distinctAttrOptions(
  attrsByEmp: ReadonlyMap<string, EmpAttrs>,
  key: 'designation' | 'pms_grade',
): string[] {
  const set = new Set<string>();
  let hasBlank = false;
  attrsByEmp.forEach((a) => {
    const v = a[key];
    if (v == null || v === '') hasBlank = true;
    else set.add(v);
  });
  const arr = Array.from(set).sort((x, y) => x.localeCompare(y));
  if (hasBlank) arr.push(BLANK_SENTINEL);
  return arr;
}

/**
 * ADR-195 — Org-axis client-side filter for Bulk Review.
 *
 * The server RPCs (`bulk_scope_preview` / `bulk_review_snapshot`) accept only
 * ONE value per org axis, so the dashboard sends `null` whenever the user
 * picks 2+ values. Without this counterpart the Company / Division /
 * Business Unit / Department filters were a silent no-op above one
 * selection. Same convention as `allowedEmployeeIds`: AND across axes, OR
 * within an axis, empty array = no constraint.
 *
 * Employees whose org attribute is unresolved (NULL) are EXCLUDED when that
 * axis has an active selection — an unmapped employee is not "in" a division.
 */
export interface EmpOrgAttrs {
  company_id: string | null;
  department_id: string | null;
  business_unit_id: string | null;
  division_id: string | null;
}

function matchesId(selected: string[], value: string | null): boolean {
  if (selected.length === 0) return true;
  if (value == null || value === '') return false;
  return selected.includes(value);
}

export function allowedOrgEmployeeIds(
  orgByEmp: ReadonlyMap<string, EmpOrgAttrs>,
  companyIds: string[],
  divisionIds: string[],
  businessUnitIds: string[],
  departmentIds: string[],
): Set<string> {
  const out = new Set<string>();
  orgByEmp.forEach((a, empId) => {
    if (!matchesId(companyIds, a.company_id)) return;
    if (!matchesId(divisionIds, a.division_id)) return;
    if (!matchesId(businessUnitIds, a.business_unit_id)) return;
    if (!matchesId(departmentIds, a.department_id)) return;
    out.add(empId);
  });
  return out;
}

/** True when any org axis has an active selection. */
export function hasOrgFilter(
  companyIds: string[], divisionIds: string[],
  businessUnitIds: string[], departmentIds: string[],
): boolean {
  return companyIds.length > 0 || divisionIds.length > 0
    || businessUnitIds.length > 0 || departmentIds.length > 0;
}
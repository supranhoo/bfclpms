import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OPTIONAL_GRID_COLUMNS } from '@/lib/employeeMasterColumns';
import { EMPLOYEE_MASTER_FIELDS } from '@/lib/employeeMasterFields';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('ADR-247 — Employee Master column parity', () => {
  const um = read('src/pages/admin/UserManagement.tsx');
  const imp = read('src/pages/admin/ImportData.tsx');

  it('grid exposes a column chooser wired to the SSOT list', () => {
    expect(um).toMatch(/allOptionalColumns/);
    expect(um).toMatch(/renderOptionalCell/);
    expect(um).toMatch(/OPTIONAL_GRID_COLUMNS/);
  });

  it('functional manager is selectable in the grid', () => {
    expect(OPTIONAL_GRID_COLUMNS.map(c => c.key)).toContain('functional_manager');
  });

  it('importer parses every master attribute that used to be dropped', () => {
    for (const alias of ['mobileNumber', 'isDummyEmployee', 'functionalManagerEmployeeId', 'employeeCategory']) {
      expect(imp).toContain(alias);
    }
  });

  it('importer writes mobile number, dummy flag and custom fields', () => {
    expect(imp).toMatch(/mobile_number/);
    expect(imp).toMatch(/is_dummy_employee/);
    expect(imp).toMatch(/mergeCustomFieldValues/);
  });

  it('export round-trips portal access, mobile and dummy flag', () => {
    expect(imp).toMatch(/portalAccess: \(profile as any\)\.portal_access/);
    expect(imp).toMatch(/mobileNumber: \(profile as any\)\.mobile_number/);
    expect(imp).toMatch(/isDummyEmployee: \(profile as any\)\.is_dummy_employee/);
  });

  it('every master field key is either a grid default, optional column, or core identity field', () => {
    const optional = new Set(OPTIONAL_GRID_COLUMNS.map(c => String(c.key)));
    const covered = new Set([
      'full_name', 'email', 'employee_code', 'designation', 'department_id',
      'pms_grade', 'reporting_manager_id', 'role', 'mobile_number',
    ]);
    const missing = EMPLOYEE_MASTER_FIELDS
      .map(f => f.key)
      .filter(k => !covered.has(k) && !optional.has(k) && !optional.has(k.replace(/_id$/, '')));
    expect(missing).toEqual([]);
  });
});

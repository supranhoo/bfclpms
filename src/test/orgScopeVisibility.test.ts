import { describe, it, expect } from 'vitest';

// Lightweight predicate test that mirrors the SQL filter in
// public.get_visible_employee_ids. Keeps the contract documented next to the
// client integration and guards against regressions if we ever move the
// filter logic back to the client.

type Employee = {
  id: string;
  company_id: string | null;
  department_id: string | null;
  business_unit_id: string | null;
  division_id: string | null;
  location: string | null;
  designation: string | null;
  pms_grade: string | null;
  level: string | null;
};
type ScopeRow = Partial<Omit<Employee, 'id'>>;

function matches(e: Employee, s: ScopeRow): boolean {
  return (
    (s.company_id == null       || s.company_id       === e.company_id) &&
    (s.department_id == null    || s.department_id    === e.department_id) &&
    (s.business_unit_id == null || s.business_unit_id === e.business_unit_id) &&
    (s.division_id == null      || s.division_id      === e.division_id) &&
    (s.location == null         || s.location         === e.location) &&
    (s.designation == null      || s.designation      === e.designation) &&
    (s.pms_grade == null        || s.pms_grade        === e.pms_grade) &&
    (s.level == null            || s.level            === e.level)
  );
}

const emp = (overrides: Partial<Employee>): Employee => ({
  id: 'e', company_id: null, department_id: null, business_unit_id: null,
  division_id: null, location: null, designation: null, pms_grade: null,
  level: null, ...overrides,
});

describe('access-profile org-scope visibility predicate', () => {
  it('single populated field matches when employee field equals', () => {
    expect(matches(emp({ company_id: 'c1' }), { company_id: 'c1' })).toBe(true);
    expect(matches(emp({ company_id: 'c2' }), { company_id: 'c1' })).toBe(false);
  });

  it('null scope fields are ignored (do not constrain)', () => {
    expect(matches(emp({ company_id: 'c1', department_id: 'd1' }), { company_id: 'c1' })).toBe(true);
  });

  it('multi-field row requires AND across populated fields', () => {
    const s = { company_id: 'c1', department_id: 'd1' };
    expect(matches(emp({ company_id: 'c1', department_id: 'd1' }), s)).toBe(true);
    expect(matches(emp({ company_id: 'c1', department_id: 'd2' }), s)).toBe(false);
  });

  it('multi-row scope behaves as OR across rows', () => {
    const rows: ScopeRow[] = [{ company_id: 'c1' }, { designation: 'CEO' }];
    const e = emp({ company_id: 'c2', designation: 'CEO' });
    expect(rows.some(s => matches(e, s))).toBe(true);
  });

  it('empty scope row set means no employees visible (non-admin)', () => {
    const rows: ScopeRow[] = [];
    expect(rows.some(s => matches(emp({ company_id: 'c1' }), s))).toBe(false);
  });
});
import { describe, it, expect } from 'vitest';
import { applyDummyEmployeeFilter, filterOutDummyById } from './dummyEmployeeFilter';

type Row = { id: string; is_dummy_employee?: boolean | null };

describe('applyDummyEmployeeFilter', () => {
  const rows: Row[] = [
    { id: 'a', is_dummy_employee: false },
    { id: 'b', is_dummy_employee: true },
    { id: 'c' /* missing flag */ },
    { id: 'd', is_dummy_employee: null },
  ];

  it('returns all rows when showDummies is true', () => {
    expect(applyDummyEmployeeFilter(rows, true, (r) => r.is_dummy_employee).map((r) => r.id))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops only rows whose flag is strictly true when showDummies is false', () => {
    expect(applyDummyEmployeeFilter(rows, false, (r) => r.is_dummy_employee).map((r) => r.id))
      .toEqual(['a', 'c', 'd']);
  });

  it('handles empty list', () => {
    expect(applyDummyEmployeeFilter([], false, () => true)).toEqual([]);
  });
});

describe('filterOutDummyById', () => {
  const rows = [
    { employee_id: 'a' },
    { employee_id: 'b' },
    { employee_id: 'c' },
    { employee_id: null },
  ];

  it('no-ops when set is empty', () => {
    expect(filterOutDummyById(rows, false, new Set(), (r) => r.employee_id)).toHaveLength(4);
  });

  it('no-ops when showDummies is true', () => {
    expect(filterOutDummyById(rows, true, new Set(['b']), (r) => r.employee_id)).toHaveLength(4);
  });

  it('removes dummies and keeps rows without an id', () => {
    const out = filterOutDummyById(rows, false, new Set(['b', 'c']), (r) => r.employee_id);
    expect(out.map((r) => r.employee_id)).toEqual(['a', null]);
  });
});
import { describe, it, expect } from 'vitest';
import type { TrendEmployee } from '@/hooks/useMonthlyTrend';

// Mirrors the filter used by MonthlyTrendView — kept here as a pure test
// to lock the PIP + BU + search combination against regressions.
function filterEmployees(
  employees: TrendEmployee[],
  opts: { buFilter: string; pipOnly: boolean; pipThreshold: number | null; search: string },
) {
  const s = opts.search.trim().toLowerCase();
  return employees.filter((e) => {
    if (opts.buFilter !== '__all__' && (e.businessUnitId ?? '') !== opts.buFilter) return false;
    if (opts.pipOnly) {
      if (opts.pipThreshold == null) return false;
      if (e.finalOnlyAvg == null || e.finalOnlyAvg >= opts.pipThreshold) return false;
    }
    if (!s) return true;
    return (
      e.fullName.toLowerCase().includes(s) ||
      e.employeeCode.toLowerCase().includes(s) ||
      e.departmentName.toLowerCase().includes(s) ||
      e.businessUnitName.toLowerCase().includes(s)
    );
  });
}

function make(overrides: Partial<TrendEmployee>): TrendEmployee {
  return {
    id: overrides.id ?? 'x',
    fullName: overrides.fullName ?? 'Person',
    employeeCode: overrides.employeeCode ?? '000',
    designation: '',
    departmentName: '',
    businessUnitId: overrides.businessUnitId ?? null,
    businessUnitName: overrides.businessUnitName ?? '',
    reportingManagerName: null,
    isActive: true,
    monthlyScores: {},
    monthlyFinalScores: {},
    avg: overrides.avg ?? null,
    finalOnlyAvg: overrides.finalOnlyAvg ?? null,
    trend: 'na',
  };
}

describe('MonthlyTrend PIP + BU filter', () => {
  const a = make({ id: 'a', businessUnitId: 'bu1', businessUnitName: 'HR', finalOnlyAvg: 2.4 });
  const b = make({ id: 'b', businessUnitId: 'bu1', businessUnitName: 'HR', finalOnlyAvg: 3.5 });
  const c = make({ id: 'c', businessUnitId: 'bu2', businessUnitName: 'Ops', finalOnlyAvg: 1.9 });
  const d = make({ id: 'd', businessUnitId: 'bu2', businessUnitName: 'Ops', finalOnlyAvg: null });
  const all = [a, b, c, d];

  it('PIP-only flags rows strictly below threshold', () => {
    const res = filterEmployees(all, { buFilter: '__all__', pipOnly: true, pipThreshold: 3, search: '' });
    expect(res.map(x => x.id).sort()).toEqual(['a', 'c']);
  });

  it('excludes rows with null finalOnlyAvg from PIP', () => {
    const res = filterEmployees([d], { buFilter: '__all__', pipOnly: true, pipThreshold: 3, search: '' });
    expect(res).toHaveLength(0);
  });

  it('BU filter narrows both PIP and non-PIP paths', () => {
    const bu1 = filterEmployees(all, { buFilter: 'bu1', pipOnly: false, pipThreshold: null, search: '' });
    expect(bu1.map(x => x.id).sort()).toEqual(['a', 'b']);

    const bu1Pip = filterEmployees(all, { buFilter: 'bu1', pipOnly: true, pipThreshold: 3, search: '' });
    expect(bu1Pip.map(x => x.id)).toEqual(['a']);
  });

  it('boundary: equal to threshold is NOT a PIP candidate', () => {
    const e = make({ id: 'e', finalOnlyAvg: 3.0 });
    const res = filterEmployees([e], { buFilter: '__all__', pipOnly: true, pipThreshold: 3, search: '' });
    expect(res).toHaveLength(0);
  });

  it('pipOnly requires a threshold to activate', () => {
    const res = filterEmployees(all, { buFilter: '__all__', pipOnly: true, pipThreshold: null, search: '' });
    expect(res).toHaveLength(0);
  });
});
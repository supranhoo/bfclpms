import { describe, it, expect } from 'vitest';
import {
  ALL_FILTER, allAxisOptions, axisOptions, matchesFilters, staleAxes,
  type BellCurveFilters,
} from '@/lib/annualReview/bellCurveFilters';
import type { BellCurveInput } from '@/lib/annualReview/bellCurve';

const ALL: BellCurveFilters = {
  bu: ALL_FILTER, dept: ALL_FILTER, manager: ALL_FILTER, division: ALL_FILTER,
  grade: ALL_FILTER, scoringSource: ALL_FILTER, eligibility: ALL_FILTER,
};

const row = (o: Partial<BellCurveInput>): BellCurveInput => ({
  instance_id: o.instance_id ?? 'i',
  employee_code: 'c', employee_name: 'n',
  total_score: 70,
  ...o,
} as BellCurveInput);

const rows: BellCurveInput[] = [
  row({ instance_id: '1', business_unit_id: 'bu1', business_unit_name: 'CLU', department_id: 'd1', department_name: 'Elect', grade: 'M1', scoring_mode: 'With KRA', eligibility_status: 'eligible' }),
  row({ instance_id: '2', business_unit_id: 'bu1', business_unit_name: 'CLU', department_id: 'd2', department_name: 'Mech', grade: 'M2', scoring_mode: 'Without KRA', eligibility_status: 'exempted' }),
  row({ instance_id: '3', business_unit_id: 'bu2', business_unit_name: 'Ferro', department_id: 'd3', department_name: 'Ops', grade: 'M3', scoring_mode: 'With KRA', eligibility_status: 'eligible' }),
];

describe('bellCurveFilters (ADR-218i)', () => {
  it('passes everything through when all axes are All', () => {
    expect(rows.filter((r) => matchesFilters(r, ALL))).toHaveLength(3);
  });

  it('narrows other axes when one filter is set', () => {
    const f = { ...ALL, bu: 'bu1' };
    expect(axisOptions(rows, f, 'dept').map(([id]) => id).sort()).toEqual(['d1', 'd2']);
    expect(axisOptions(rows, f, 'grade').map(([id]) => id).sort()).toEqual(['M1', 'M2']);
  });

  it('keeps the full list for the axis being edited', () => {
    const f = { ...ALL, bu: 'bu1' };
    expect(axisOptions(rows, f, 'bu').map(([id]) => id).sort()).toEqual(['bu1', 'bu2']);
  });

  it('cascades across three axes with AND semantics', () => {
    const f = { ...ALL, bu: 'bu1', scoringSource: 'kra' };
    expect(axisOptions(rows, f, 'dept').map(([id]) => id)).toEqual(['d1']);
    expect(axisOptions(rows, f, 'eligibility').map(([id]) => id)).toEqual(['eligible']);
  });

  it('flags every selection in a contradictory combination', () => {
    // bu2 has no d1 department, so neither axis survives the other's filter.
    const f = { ...ALL, bu: 'bu2', dept: 'd1' };
    expect(staleAxes(f, allAxisOptions(rows, f)).sort()).toEqual(['bu', 'dept']);
  });

  it('reports no stale axis for a valid combination', () => {
    const f = { ...ALL, bu: 'bu1', dept: 'd2' };
    expect(staleAxes(f, allAxisOptions(rows, f))).toEqual([]);
  });
});

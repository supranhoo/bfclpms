import { describe, it, expect } from 'vitest';
import {
  allowedEmployeeIds, distinctAttrOptions, BLANK_SENTINEL, type EmpAttrs,
} from './bulkEmployeeFilter';

const ATTRS = new Map<string, EmpAttrs>([
  ['e1', { designation: 'Manager',  pms_grade: 'M1', reporting_manager_id: 'm1' }],
  ['e2', { designation: 'Engineer', pms_grade: 'E2', reporting_manager_id: 'm1' }],
  ['e3', { designation: 'Engineer', pms_grade: null, reporting_manager_id: 'm2' }],
  ['e4', { designation: null,       pms_grade: 'E2', reporting_manager_id: null }],
]);

describe('bulkEmployeeFilter', () => {
  it('empty selections pass everything through', () => {
    const got = allowedEmployeeIds(ATTRS, [], [], []);
    expect(got.size).toBe(4);
  });

  it('combines axes with AND, values within an axis with OR', () => {
    const got = allowedEmployeeIds(ATTRS, ['Engineer'], ['E2'], []);
    expect([...got].sort()).toEqual(['e2']);
  });

  it('honours the (blank) sentinel for nulls', () => {
    const got = allowedEmployeeIds(ATTRS, [BLANK_SENTINEL], [], []);
    expect([...got]).toEqual(['e4']);
  });

  it('distinctAttrOptions sorts and appends blank sentinel last', () => {
    expect(distinctAttrOptions(ATTRS, 'designation'))
      .toEqual(['Engineer', 'Manager', BLANK_SENTINEL]);
    expect(distinctAttrOptions(ATTRS, 'pms_grade'))
      .toEqual(['E2', 'M1', BLANK_SENTINEL]);
  });

  it('reporting-manager axis matches selected ids', () => {
    const got = allowedEmployeeIds(ATTRS, [], [], ['m1']);
    expect([...got].sort()).toEqual(['e1', 'e2']);
  });
});
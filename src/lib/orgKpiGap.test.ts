import { describe, it, expect } from 'vitest';
import { classifyOrgKpiRow } from './orgKpiGap';

describe('classifyOrgKpiRow', () => {
  const names = new Map([
    ['e1', 'Alice'], ['e2', 'Bob'], ['e3', 'Cara'],
  ]);

  it('returns none when no employee has org flag', () => {
    const r = classifyOrgKpiRow({
      kpiIds: ['k1', 'k2'],
      employeeIds: ['e1', 'e2'],
      isOrgByKpiId: new Map([['k1', false], ['k2', false]]),
      employeeNameById: names,
    });
    expect(r.status).toBe('none');
    expect(r.mappedCount).toBe(0);
  });

  it('returns all when every employee has org flag', () => {
    const r = classifyOrgKpiRow({
      kpiIds: ['k1', 'k2'],
      employeeIds: ['e1', 'e2'],
      isOrgByKpiId: new Map([['k1', true], ['k2', true]]),
      employeeNameById: names,
    });
    expect(r.status).toBe('all');
    expect(r.mappedCount).toBe(2);
    expect(r.missingEmployeeNames).toEqual([]);
  });

  it('returns gap and lists missing employee names', () => {
    const r = classifyOrgKpiRow({
      kpiIds: ['k1', 'k2', 'k3'],
      employeeIds: ['e1', 'e2', 'e3'],
      isOrgByKpiId: new Map([['k1', true], ['k2', false], ['k3', true]]),
      employeeNameById: names,
    });
    expect(r.status).toBe('gap');
    expect(r.mappedCount).toBe(2);
    expect(r.totalCount).toBe(3);
    expect(r.missingEmployeeNames).toEqual(['Bob']);
  });

  it('handles empty input gracefully', () => {
    const r = classifyOrgKpiRow({
      kpiIds: [], employeeIds: [], isOrgByKpiId: new Map(),
    });
    expect(r).toEqual({ status: 'none', mappedCount: 0, totalCount: 0, missingEmployeeNames: [] });
  });
});
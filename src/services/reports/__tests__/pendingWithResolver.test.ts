import { describe, it, expect } from 'vitest';
import {
  resolvePendingWithForKpi,
  PENDING_WITH_NONE,
  type PendingWithContext,
} from '@/services/reports/pendingWithResolver';

const CHAIN = ['self_review', 'manager_check', 'skip_level_check', 'audit', 'management_review'];

function ctx(overrides: Partial<PendingWithContext> = {}): PendingWithContext {
  return {
    profileMap: new Map([
      ['emp', { id: 'emp', full_name: 'Anup Kumar', reporting_manager_id: 'mgr' }],
      ['mgr', { id: 'mgr', full_name: 'Manoj Kumar', reporting_manager_id: 'skip' }],
      ['skip', { id: 'skip', full_name: 'Rakesh Verma' }],
      ['orphan', { id: 'orphan', full_name: 'No Manager' }],
    ]),
    managerToSkip: new Map([['mgr', 'skip']]),
    ownerMap: new Map([['cat||KRA||KPI', ['Chandan Pandit', 'Vivek Dansena']]]),
    stageChainMap: new Map([
      ['emp', CHAIN],
      ['orphan', CHAIN],
    ]),
    kpiIdToAuditorNames: new Map([['k-assigned', 'Shekhar Sharad']]),
    hrPmsNames: 'Neha Sharma',
    auditorNames: 'Global Auditor',
    managementNames: 'Umesh Mehta',
    ...overrides,
  };
}

const baseKpi = {
  id: 'k1',
  employee_id: 'emp',
  status: 'self_review',
  is_org_level: false,
  category_id: 'cat',
  kra_name: 'KRA',
  kpi_name: 'KPI',
};

describe('resolvePendingWithForKpi', () => {
  it('returns em-dash for approved KPIs', () => {
    expect(resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'approved' })).toBe(PENDING_WITH_NONE);
  });

  it('self_review points at the reporting manager', () => {
    expect(resolvePendingWithForKpi(ctx(), baseKpi)).toBe('Manoj Kumar');
  });

  it('manager_check points at the skip-level manager from the resolved chain', () => {
    expect(resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'manager_check' })).toBe('Rakesh Verma');
  });

  it('org KPI at kra_set lists the data owners', () => {
    expect(
      resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'kra_set', is_org_level: true }),
    ).toBe('Chandan Pandit, Vivek Dansena');
  });

  it('individual KPI at kra_set points at the employee', () => {
    expect(resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'kra_set' })).toBe('Anup Kumar');
  });

  it('per-KPI auditor assignment overrides the global auditor pool', () => {
    expect(
      resolvePendingWithForKpi(ctx(), { ...baseKpi, id: 'k-assigned', status: 'skip_level_check' }),
    ).toBe('Shekhar Sharad');
    expect(
      resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'skip_level_check' }),
    ).toBe('Global Auditor');
  });

  it('audit hands over to management names', () => {
    expect(resolvePendingWithForKpi(ctx(), { ...baseKpi, status: 'audit' })).toBe('Umesh Mehta');
  });

  it('employee without a reporting manager yields em-dash at self_review', () => {
    expect(
      resolvePendingWithForKpi(ctx(), { ...baseKpi, employee_id: 'orphan' }),
    ).toBe(PENDING_WITH_NONE);
  });

  it('unknown employee (no chain, no profile) yields em-dash', () => {
    expect(
      resolvePendingWithForKpi(ctx(), { ...baseKpi, employee_id: 'ghost', status: 'manager_check' }),
    ).toBe(PENDING_WITH_NONE);
  });
});
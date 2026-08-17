import { describe, it, expect } from 'vitest';
import { resolvePendingAtLevel, PENDING_AT_NONE } from '@/lib/reports/pendingAtLevel';
import { resolvePendingWith } from '@/lib/kpiPendingWith';

const FULL = ['self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];
const SHORT = ['self_review', 'manager_check', 'approved'];
const FM = ['self_review', 'manager_check', 'functional_manager_check', 'approved'];

describe('resolvePendingAtLevel (ADR-293)', () => {
  it('self_review means self review is DONE -> pending with Manager', () => {
    expect(resolvePendingAtLevel({ status: 'self_review', isOrgKpi: false, stageChain: FULL })).toBe('Manager');
  });

  it('kra_set on an individual KPI waits on the employee', () => {
    expect(resolvePendingAtLevel({ status: 'kra_set', isOrgKpi: false, stageChain: FULL })).toBe('Employee (Self Review)');
  });

  it('kra_set on an org KPI waits on the data owner', () => {
    expect(resolvePendingAtLevel({ status: 'kra_set', isOrgKpi: true, stageChain: FULL })).toBe('Org KPI Data Owner');
  });

  it('honours a chain without skip-level', () => {
    expect(resolvePendingAtLevel({ status: 'manager_check', isOrgKpi: false, stageChain: SHORT })).toBe(PENDING_AT_NONE);
    expect(resolvePendingAtLevel({ status: 'manager_check', isOrgKpi: false, stageChain: FULL })).toBe('Skip-Level Manager');
  });

  it('supports functional manager chains', () => {
    expect(resolvePendingAtLevel({ status: 'manager_check', isOrgKpi: false, stageChain: FM })).toBe('Functional Manager');
  });

  it('approved and unknown statuses render an em-dash', () => {
    expect(resolvePendingAtLevel({ status: 'approved', isOrgKpi: false, stageChain: FULL })).toBe(PENDING_AT_NONE);
    expect(resolvePendingAtLevel({ status: null, isOrgKpi: false, stageChain: FULL })).toBe(PENDING_AT_NONE);
  });

  it('never disagrees with the Pending With resolver', () => {
    const level = resolvePendingAtLevel({ status: 'self_review', isOrgKpi: false, stageChain: FULL });
    const name = resolvePendingWith({
      status: 'self_review', isOrgKpi: false, dataOwnerNames: '',
      employeeName: 'Abhas', managerName: 'Gaurav Budhia', skipManagerName: 'Skip',
      stageChain: FULL,
    });
    expect(level).toBe('Manager');
    expect(name).toBe('Gaurav Budhia');
  });

  it('screen and export read the same resolved value', () => {
    const args = { status: 'hr_pms_review', isOrgKpi: false, stageChain: FULL } as const;
    expect(resolvePendingAtLevel(args)).toBe(resolvePendingAtLevel({ ...args }));
    expect(resolvePendingAtLevel(args)).toBe('Audit');
  });
});

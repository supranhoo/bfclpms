import { describe, it, expect } from 'vitest';
import { resolvePendingWith, PENDING_WITH_NONE } from '@/lib/kpiPendingWith';

const base = {
  isOrgKpi: false,
  dataOwnerNames: '',
  employeeName: 'Upendra Singh',
  managerName: 'Manoj Kumar',
  skipManagerName: 'Rakesh Verma',
  stageChain: [
    'self_review',
    'manager_check',
    'skip_level_check',
    'hr_pms_review',
    'audit',
    'management_review',
  ],
};

describe('resolvePendingWith', () => {
  it('returns em-dash when approved', () => {
    expect(resolvePendingWith({ ...base, status: 'approved' })).toBe(PENDING_WITH_NONE);
  });

  it('kra_set + org KPI returns joined data owner names', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'kra_set',
        isOrgKpi: true,
        dataOwnerNames: 'Chandan Pandit, Vivek Dansena',
      }),
    ).toBe('Chandan Pandit, Vivek Dansena');
  });

  it('kra_set + individual KPI returns the employee name', () => {
    expect(resolvePendingWith({ ...base, status: 'kra_set' })).toBe('Upendra Singh');
  });

  it('self_review returns the reporting manager name', () => {
    expect(resolvePendingWith({ ...base, status: 'self_review' })).toBe('Manoj Kumar');
  });

  it('manager_check → skip_level in full chain returns skip manager name', () => {
    expect(resolvePendingWith({ ...base, status: 'manager_check' })).toBe('Rakesh Verma');
  });

  it('manager_check → audit workflow returns "Audit"', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'audit', 'management_review'],
      }),
    ).toBe('Audit');
  });

  it('manager_check → hr_pms workflow returns "HR PMS"', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'hr_pms_review'],
      }),
    ).toBe('HR PMS');
  });

  it('manager_check → management workflow returns "Management"', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'management_review'],
      }),
    ).toBe('Management');
  });

  it('hr_pms_review with no further stage returns em-dash', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'hr_pms_review',
        stageChain: ['self_review', 'manager_check', 'hr_pms_review'],
      }),
    ).toBe(PENDING_WITH_NONE);
  });

  it('audit → management returns "Management"', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'audit',
        stageChain: ['self_review', 'manager_check', 'audit', 'management_review'],
      }),
    ).toBe('Management');
  });

  it('self_review with null manager returns em-dash', () => {
    expect(
      resolvePendingWith({ ...base, status: 'self_review', managerName: null }),
    ).toBe(PENDING_WITH_NONE);
  });

  it('manager_check → skip_level with null skip manager returns em-dash', () => {
    expect(
      resolvePendingWith({ ...base, status: 'manager_check', skipManagerName: null }),
    ).toBe(PENDING_WITH_NONE);
  });

  it('kra_set org KPI with no data owner returns em-dash', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'kra_set',
        isOrgKpi: true,
        dataOwnerNames: '',
      }),
    ).toBe(PENDING_WITH_NONE);
  });

  it('manager_check → hr_pms shows HR PMS user names when provided', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'hr_pms_review'],
        hrPmsNames: 'Neha Sharma, Priya Verma',
      }),
    ).toBe('Neha Sharma, Priya Verma');
  });

  it('manager_check → audit shows assigned auditor names when provided', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'audit', 'management_review'],
        auditorNames: 'Shekhar Sharad',
      }),
    ).toBe('Shekhar Sharad');
  });

  it('audit → management shows management user names when provided', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'audit',
        stageChain: ['self_review', 'manager_check', 'audit', 'management_review'],
        managementNames: 'Umesh Mehta',
      }),
    ).toBe('Umesh Mehta');
  });

  it('falls back to queue label when queue-stage names are empty', () => {
    expect(
      resolvePendingWith({
        ...base,
        status: 'manager_check',
        stageChain: ['self_review', 'manager_check', 'hr_pms_review'],
        hrPmsNames: '',
      }),
    ).toBe('HR PMS');
  });
});
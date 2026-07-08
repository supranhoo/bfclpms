import { describe, it, expect } from 'vitest';
import { getFinalApproverLabel, NO_APPROVER_LABEL } from '@/lib/finalApproverMap';

describe('getFinalApproverLabel', () => {
  it('returns em-dash for empty / null stages', () => {
    expect(getFinalApproverLabel([])).toBe(NO_APPROVER_LABEL);
    expect(getFinalApproverLabel(null)).toBe(NO_APPROVER_LABEL);
    expect(getFinalApproverLabel(undefined)).toBe(NO_APPROVER_LABEL);
  });

  it('returns L1 Manager when workflow ends at manager_check', () => {
    expect(getFinalApproverLabel(['self_review', 'manager_check'])).toBe('L1 Manager');
  });

  it('returns Management when workflow ends at management_review', () => {
    expect(
      getFinalApproverLabel([
        'self_review',
        'manager_check',
        'skip_level_check',
        'hr_pms_review',
        'management_review',
      ]),
    ).toBe('Management');
  });

  it('returns Auditor when workflow ends at audit', () => {
    expect(getFinalApproverLabel(['self_review', 'manager_check', 'audit'])).toBe('Auditor');
  });

  it('falls back to em-dash when only self stage is present', () => {
    expect(getFinalApproverLabel(['self_review'])).toBe(NO_APPROVER_LABEL);
  });

  it('skips unknown trailing stages and picks the last recognised approver', () => {
    expect(
      getFinalApproverLabel(['self_review', 'manager_check', 'some_future_stage']),
    ).toBe('L1 Manager');
  });
});
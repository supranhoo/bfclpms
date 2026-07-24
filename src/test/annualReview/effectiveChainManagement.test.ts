import { describe, it, expect } from 'vitest';
import { effectiveStages, resolveEffectiveChain } from '@/lib/annualReview/effectiveChain';
import { buildReviewerNamesByStage } from '@/lib/annualReview/reviewerNames';

describe('effectiveChain — management terminal stage (ADR-138)', () => {
  const input = {
    enabledStages: ['self', 'management'] as const,
    employeeId: 'jaspal',
    reviewers: {
      manager: null,
      skip_manager: null,
      dept_head: null,
      bu_head: null,
      hr: null,
      management: 'dummy',
    },
    activeById: { dummy: true, jaspal: true },
  };

  it('keeps management in the forward effective chain for BU-Head instances', () => {
    expect(effectiveStages(input as any)).toEqual(['self', 'management']);
  });

  it('resolves reviewerId for the management stage', () => {
    const rows = resolveEffectiveChain(input as any);
    const mgmt = rows.find((r) => r.stage === 'management');
    expect(mgmt?.skipped).toBe(false);
    expect(mgmt?.reviewerId).toBe('dummy');
  });

  it('buildReviewerNamesByStage exposes the management label', () => {
    const map = buildReviewerNamesByStage(
      {
        employee_id: 'jaspal',
        manager_id: null,
        skip_id: null,
        dept_head_id: null,
        bu_head_id: null,
        hr_id: null,
        management_id: 'dummy',
      },
      [{ id: 'dummy', full_name: 'Dummy', email: null, employee_code: '001' }],
    );
    expect(map.management).toBe('Dummy (001)');
  });
});
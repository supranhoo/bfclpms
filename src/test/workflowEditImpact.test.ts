import { describe, it, expect } from 'vitest';
import { computeWorkflowEditImpact } from '@/lib/annualReview/workflowEditImpact';

const locked = (role: string) => ({ role, reviewer_name: `${role} user`, submitted_at: '2026-07-01' });

describe('computeWorkflowEditImpact', () => {
  it('no changes → no impact', () => {
    const r = computeWorkflowEditImpact({
      currentStages: ['self','manager','bu_head'],
      currentStatus: 'pending_manager',
      nextStages: ['self','manager','bu_head'],
      reviewerChanges: [],
      lockedResponses: [locked('self')],
    });
    expect(r.archives).toEqual([]);
    expect(r.needsSupersede).toBe(false);
    expect(r.rewindTo).toBeNull();
  });

  it('removing an actioned stage forces supersede + archive', () => {
    const r = computeWorkflowEditImpact({
      currentStages: ['self','manager','bu_head'],
      currentStatus: 'pending_bu',
      nextStages: ['self','bu_head'],
      reviewerChanges: [],
      lockedResponses: [locked('self'), locked('manager')],
    });
    expect(r.removedStages).toEqual(['manager']);
    expect(r.needsSupersede).toBe(true);
    expect(r.archives.map((a) => a.role)).toEqual(['manager']);
    expect(r.archives[0].cause).toBe('stage_removed');
  });

  it('reviewer swap on a completed instance rewinds to that stage', () => {
    const r = computeWorkflowEditImpact({
      currentStages: ['self','manager','bu_head'],
      currentStatus: 'completed',
      nextStages: ['self','manager','bu_head'],
      reviewerChanges: [{ role: 'manager', newReviewerId: 'x' }],
      lockedResponses: [locked('self'), locked('manager'), locked('bu_head')],
    });
    expect(r.needsSupersede).toBe(true);
    expect(r.rewindTo).toBe('pending_manager');
    expect(r.archives.find((a) => a.role === 'manager')?.cause).toBe('reviewer_replaced');
  });

  it('employee notice fires when terminal changes', () => {
    const r = computeWorkflowEditImpact({
      currentStages: ['self','bu_head'],
      currentStatus: 'pending_bu',
      nextStages: ['self','management'],
      reviewerChanges: [],
      lockedResponses: [],
    });
    expect(r.notifications.some((n) => n.kind === 'employee_workflow_changed')).toBe(true);
  });

  it('pre-action edits are safe (no supersede required)', () => {
    const r = computeWorkflowEditImpact({
      currentStages: ['self','manager','bu_head'],
      currentStatus: 'pending_self',
      nextStages: ['self','bu_head'],
      reviewerChanges: [],
      lockedResponses: [],
    });
    expect(r.needsSupersede).toBe(false);
  });
});
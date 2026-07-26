import { describe, it, expect } from 'vitest';
import {
  canEditWorkflowAndReviewers,
  workflowEditReopensCompleted,
} from '@/lib/annualReview/workflowEditVisibility';

/**
 * ADR-160d regression guard. The action was hidden for every mid-workflow
 * status because the template-reset gate (`isPastSelf`) was reused for it.
 */
describe('canEditWorkflowAndReviewers', () => {
  const visible = [
    'not_started',
    'pending_self',
    'pending_manager',
    'pending_skip',
    'pending_dept',
    'pending_bu',
    'pending_management',
    'pending_hr',
    'completed',
  ];

  it.each(visible)('offers the action at status %s', (status) => {
    expect(canEditWorkflowAndReviewers(status)).toBe(true);
  });

  it('hides the action for excluded instances', () => {
    expect(canEditWorkflowAndReviewers('excluded')).toBe(false);
  });

  it('hides the action when status is missing', () => {
    expect(canEditWorkflowAndReviewers(null)).toBe(false);
    expect(canEditWorkflowAndReviewers(undefined)).toBe(false);
  });

  it('flags only completed reviews as a destructive re-open', () => {
    expect(workflowEditReopensCompleted('completed')).toBe(true);
    for (const s of visible.filter((s) => s !== 'completed')) {
      expect(workflowEditReopensCompleted(s)).toBe(false);
    }
  });
});
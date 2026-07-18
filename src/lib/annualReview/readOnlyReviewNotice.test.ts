import { describe, expect, it } from 'vitest';
import { getReadOnlyReviewNotice } from './readOnlyReviewNotice';

describe('annual-review read-only notice', () => {
  it('explains the personal-login restriction while self review is pending', () => {
    expect(getReadOnlyReviewNotice('pending_self')).toEqual({
      title: 'Assisted submission unavailable',
      description: 'This employee has personal login access and must submit the self review from My Annual Review. Their saved draft remains unchanged.',
    });
  });

  it('explains stage ownership after self review has advanced', () => {
    expect(getReadOnlyReviewNotice('pending_dept')).toEqual({
      title: 'View-only review',
      description: 'This review is currently at department head review. Only the assigned reviewer for the current stage can edit or submit it; completed self scores remain locked.',
    });
  });
});
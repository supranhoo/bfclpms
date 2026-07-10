import { describe, expect, it } from 'vitest';
import { annualReviewTeamAccessAllowed } from '@/lib/annualReview/teamAccess';

describe('annualReviewTeamAccessAllowed', () => {
  it('keeps existing static Annual Review team roles allowed', () => {
    expect(annualReviewTeamAccessAllowed('admin', false)).toBe(true);
    expect(annualReviewTeamAccessAllowed('manager', false)).toBe(true);
    expect(annualReviewTeamAccessAllowed('hr_pms', false)).toBe(true);
  });

  it('allows HR-Team / BU-scoped users approved by the backend directory resolver', () => {
    expect(annualReviewTeamAccessAllowed('employee', true)).toBe(true);
    expect(annualReviewTeamAccessAllowed('auditor', true)).toBe(true);
  });

  it('denies ordinary employees when the backend resolver denies directory access', () => {
    expect(annualReviewTeamAccessAllowed('employee', false)).toBe(false);
    expect(annualReviewTeamAccessAllowed(null, false)).toBe(false);
  });
});
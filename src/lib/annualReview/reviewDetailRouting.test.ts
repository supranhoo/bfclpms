import { describe, expect, it } from 'vitest';
import { shouldRedirectToOwnAnnualReview } from './reviewDetailRouting';

describe('annual-review detail routing', () => {
  it('redirects an employee opening their own team-detail record', () => {
    expect(shouldRedirectToOwnAnnualReview('employee-1', 'employee-1')).toBe(true);
  });

  it('keeps a reviewer or eligible proxy on the team-detail record', () => {
    expect(shouldRedirectToOwnAnnualReview('employee-1', 'manager-1')).toBe(false);
    expect(shouldRedirectToOwnAnnualReview('employee-1', undefined)).toBe(false);
  });
});
import { describe, it, expect } from 'vitest';
import { getCycleMembers } from '@/lib/multimonthAssignment';

describe('getCycleMembers — cycle-scoped sibling resolution', () => {
  it('Bi-Monthly March 2026 → cycle = [Mar, Apr] (NOT Jan/Feb/May)', () => {
    const members = getCycleMembers({
      frequency: 'Bi-Monthly',
      reviewPeriod: 'March',
      reviewYear: 2026,
    });
    expect(members).toEqual([
      { period: 'March', year: 2026 },
      { period: 'April', year: 2026 },
    ]);
  });

  it('Bi-Monthly April 2026 → cycle = [Mar, Apr]', () => {
    const members = getCycleMembers({
      frequency: 'Bi-Monthly',
      reviewPeriod: 'April',
      reviewYear: 2026,
    });
    expect(members.map((m) => m.period).sort()).toEqual(['April', 'March']);
  });

  it('Quarterly March 2026 (Jan–Mar) → cycle = [Jan, Feb, Mar] only', () => {
    const members = getCycleMembers({
      frequency: 'Quarterly',
      reviewPeriod: 'March',
      reviewYear: 2026,
    });
    const months = members.map((m) => m.period);
    expect(months).toContain('January');
    expect(months).toContain('February');
    expect(months).toContain('March');
    expect(months).not.toContain('April');
    expect(months).not.toContain('May');
    expect(months).not.toContain('June');
  });

  it('Daily / Monthly / Weekly → no cross-month siblings (returns only source)', () => {
    for (const freq of ['Daily', 'Weekly', 'Monthly']) {
      const members = getCycleMembers({
        frequency: freq,
        reviewPeriod: 'March',
        reviewYear: 2026,
      });
      expect(members).toEqual([{ period: 'March', year: 2026 }]);
    }
  });

  it('Quarterly November 2026 (Oct–Dec) → all members in 2026, no leak to 2027', () => {
    const members = getCycleMembers({
      frequency: 'Quarterly',
      reviewPeriod: 'November',
      reviewYear: 2026,
    });
    expect(members.every((m) => m.year === 2026)).toBe(true);
  });
});
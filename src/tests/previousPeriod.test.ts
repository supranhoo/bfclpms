import { describe, it, expect } from 'vitest';
import { getPreviousMonthPeriod } from '@/lib/previousPeriod';

describe('getPreviousMonthPeriod (ADR-362)', () => {
  it('returns the prior month mid-year', () => {
    expect(getPreviousMonthPeriod(new Date(2026, 8, 5))) // Sep 5 2026
      .toEqual({ month: 'August', year: 2026 });
  });

  it('rolls January back to December of the previous year', () => {
    expect(getPreviousMonthPeriod(new Date(2026, 0, 15))) // Jan 15 2026
      .toEqual({ month: 'December', year: 2025 });
  });

  it('handles month-end dates safely (e.g. Mar 31 → February)', () => {
    expect(getPreviousMonthPeriod(new Date(2026, 2, 31))) // Mar 31 2026
      .toEqual({ month: 'February', year: 2026 });
  });

  it('handles March in a leap-year context (Mar 31 2024 → Feb 2024)', () => {
    expect(getPreviousMonthPeriod(new Date(2024, 2, 31)))
      .toEqual({ month: 'February', year: 2024 });
  });
});

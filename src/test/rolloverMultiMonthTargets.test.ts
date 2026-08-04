import { describe, it, expect } from 'vitest';
import {
  resolveRolloutTargets,
  describeTargets,
  fiscalYearStartOf,
  MAX_ROLLOUT_PERIODS,
} from '@/lib/rolloverTargets';

describe('ADR-248 multi-month rollout targets', () => {
  it('single mode returns just the chosen period', () => {
    const t = resolveRolloutTargets({ month: 'August', year: 2026 }, 'single');
    expect(t).toEqual([{ month: 'August', year: 2026 }]);
  });

  it('next N months wraps the year boundary', () => {
    const t = resolveRolloutTargets({ month: 'November', year: 2026 }, 'next_n', 4);
    expect(t).toEqual([
      { month: 'November', year: 2026 },
      { month: 'December', year: 2026 },
      { month: 'January', year: 2027 },
      { month: 'February', year: 2027 },
    ]);
  });

  it('rest of fiscal year runs to June of the next calendar year', () => {
    const t = resolveRolloutTargets({ month: 'November', year: 2026 }, 'rest_of_fy');
    expect(t[0]).toEqual({ month: 'November', year: 2026 });
    expect(t[t.length - 1]).toEqual({ month: 'June', year: 2027 });
    expect(t).toHaveLength(8);
  });

  it('rest of fiscal year from a Jan-Jun month stays in the same calendar year', () => {
    const t = resolveRolloutTargets({ month: 'February', year: 2027 }, 'rest_of_fy');
    expect(t[t.length - 1]).toEqual({ month: 'June', year: 2027 });
    expect(t).toHaveLength(5);
  });

  it('full assessment period never rolls backwards before the chosen target', () => {
    const t = resolveRolloutTargets({ month: 'October', year: 2026 }, 'full_fy');
    expect(t[0]).toEqual({ month: 'October', year: 2026 });
    expect(t[t.length - 1]).toEqual({ month: 'June', year: 2027 });
  });

  it('full assessment period from July covers all 12 months', () => {
    const t = resolveRolloutTargets({ month: 'July', year: 2026 }, 'full_fy');
    expect(t).toHaveLength(12);
    expect(t[11]).toEqual({ month: 'June', year: 2027 });
  });

  it('caps at MAX_ROLLOUT_PERIODS', () => {
    const t = resolveRolloutTargets({ month: 'July', year: 2026 }, 'next_n', 99);
    expect(t).toHaveLength(MAX_ROLLOUT_PERIODS);
  });

  it('fiscal year start follows the July-June cycle', () => {
    expect(fiscalYearStartOf({ month: 'August', year: 2026 })).toBe(2026);
    expect(fiscalYearStartOf({ month: 'February', year: 2027 })).toBe(2026);
  });

  it('describes targets grouped by year', () => {
    const t = resolveRolloutTargets({ month: 'December', year: 2026 }, 'next_n', 2);
    expect(describeTargets(t)).toBe('Dec 2026 · Jan 2027');
  });
});

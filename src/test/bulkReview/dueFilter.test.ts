import { describe, it, expect } from 'vitest';
import { isRowDueInPeriod } from '@/lib/bulkReviewDueFilter';

describe('isRowDueInPeriod — Bulk Review non-due filter', () => {
  it('Bi-Monthly Mar-Apr: row hidden in March, visible in April (terminal)', () => {
    const row = { frequency: 'Bi-Monthly', frequency_cycle_start: 'Mar-Apr' };
    expect(isRowDueInPeriod(row, 'March', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'April', 2026)).toBe(true);
  });

  it('Bi-Monthly Apr-May: row hidden in April, visible in May', () => {
    const row = { frequency: 'Bi-Monthly', frequency_cycle_start: 'Apr-May' };
    expect(isRowDueInPeriod(row, 'April', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'May', 2026)).toBe(true);
  });

  it('Quarterly Jan-Mar: hidden Jan & Feb, visible Mar', () => {
    const row = { frequency: 'Quarterly', frequency_cycle_start: 'Jan-Mar' };
    expect(isRowDueInPeriod(row, 'January', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'February', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'March', 2026)).toBe(true);
  });

  it('Half-Yearly Jul-Dec: hidden Jul–Nov, visible Dec', () => {
    const row = { frequency: 'Half-Yearly', frequency_cycle_start: 'Jul-Dec' };
    expect(isRowDueInPeriod(row, 'August', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'December', 2026)).toBe(true);
  });

  it('Monthly / Weekly / Daily are always due', () => {
    for (const f of ['Monthly', 'Weekly', 'Daily']) {
      const row = { frequency: f, frequency_cycle_start: null };
      expect(isRowDueInPeriod(row, 'April', 2026)).toBe(true);
      expect(isRowDueInPeriod(row, 'November', 2026)).toBe(true);
    }
  });

  it('Missing frequency_cycle_start on multi-month → safe default: due', () => {
    const row = { frequency: 'Bi-Monthly', frequency_cycle_start: null };
    expect(isRowDueInPeriod(row, 'April', 2026)).toBe(true);
  });

  it('Null / unknown frequency → due', () => {
    expect(isRowDueInPeriod({ frequency: null }, 'April', 2026)).toBe(true);
    expect(isRowDueInPeriod({ frequency: 'Bogus' }, 'April', 2026)).toBe(true);
  });
});
import { describe, it, expect } from 'vitest';
import { isRowDueInPeriod } from '@/lib/bulkReviewDueFilter';

describe('isRowDueInPeriod — Bulk Review non-due filter', () => {
  it('Bi-Monthly Mar-Apr: row hidden in March, visible in April (terminal)', () => {
    const row = { frequency: 'Bi-Monthly', frequency_cycle_start: 'Mar-Apr' };
    expect(isRowDueInPeriod(row, 'March', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'April', 2026)).toBe(true);
  });

  it('Bi-Monthly May-Jun: row hidden in May, visible in June', () => {
    const row = { frequency: 'Bi-Monthly', frequency_cycle_start: 'May-Jun' };
    expect(isRowDueInPeriod(row, 'May', 2026)).toBe(false);
    expect(isRowDueInPeriod(row, 'June', 2026)).toBe(true);
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

  it('Missing frequency_cycle_start → cascading default applies (Jitendra RCA Jun 2026)', () => {
    // Bi-Monthly default = Jan-Feb option → active months Feb, Apr, Jun, Aug, Oct, Dec.
    const biRow = { frequency: 'Bi-Monthly', frequency_cycle_start: null };
    expect(isRowDueInPeriod(biRow, 'April', 2026)).toBe(true);   // active month of Mar-Apr cycle
    expect(isRowDueInPeriod(biRow, 'March', 2026)).toBe(false);  // locked sibling

    // Quarterly default = Jan-Mar option → active months Mar, Jun, Sep, Dec.
    const qRow = { frequency: 'Quarterly', frequency_cycle_start: null };
    expect(isRowDueInPeriod(qRow, 'April', 2026)).toBe(false);   // locked in Q2
    expect(isRowDueInPeriod(qRow, 'March', 2026)).toBe(true);    // active month of Q1
    expect(isRowDueInPeriod(qRow, 'June', 2026)).toBe(true);     // active month of Q2

    // Empty-string cycle_start treated identically to null.
    const qRowEmpty = { frequency: 'Quarterly', frequency_cycle_start: '' };
    expect(isRowDueInPeriod(qRowEmpty, 'April', 2026)).toBe(false);
  });

  it('Off-cycle month for a cycle that does not include it → not due', () => {
    // Half-Yearly May-Oct cycle: H1 active=Oct, H2 active=Apr → April IS in H2 cycle.
    // So April should be DUE (active of H2 Nov-Apr).
    const hyApr = { frequency: 'Half-Yearly', frequency_cycle_start: 'May-Oct' };
    expect(isRowDueInPeriod(hyApr, 'April', 2026)).toBe(true);
    expect(isRowDueInPeriod(hyApr, 'October', 2026)).toBe(true);
    expect(isRowDueInPeriod(hyApr, 'June', 2026)).toBe(false);  // locked sibling in H1

    // Quarterly Apr-Jun cycle in February: Feb belongs to Q4 [1,2] of this cycle
    // (Q4 active month = March). So Feb is a locked sibling, not off-cycle.
    const qFy = { frequency: 'Quarterly', frequency_cycle_start: 'Apr-Jun' };
    expect(isRowDueInPeriod(qFy, 'February', 2026)).toBe(false);
    expect(isRowDueInPeriod(qFy, 'June', 2026)).toBe(true);   // active month
  });

  it('Null / unknown frequency → due', () => {
    expect(isRowDueInPeriod({ frequency: null }, 'April', 2026)).toBe(true);
    expect(isRowDueInPeriod({ frequency: 'Bogus' }, 'April', 2026)).toBe(true);
  });
});
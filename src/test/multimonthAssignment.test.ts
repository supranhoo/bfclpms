import { describe, it, expect } from 'vitest';
import { buildSiblingPeriods } from '@/lib/multimonthAssignment';

describe('buildSiblingPeriods', () => {
  it('Quarterly assigned in May 2026 (Apr–Jun) → terminal June, siblings [May]', () => {
    const r = buildSiblingPeriods({
      frequency: 'Quarterly',
      assignedMonth: 'May',
      reviewYear: 2026,
    });
    expect(r.isMultiMonth).toBe(true);
    expect(r.terminal).toEqual({ period: 'June', year: 2026 });
    expect(r.siblings).toEqual([{ period: 'May', year: 2026 }]);
  });

  it('Quarterly assigned in April 2026 → terminal June, siblings [April, May]', () => {
    const r = buildSiblingPeriods({
      frequency: 'Quarterly',
      assignedMonth: 'April',
      reviewYear: 2026,
    });
    expect(r.terminal).toEqual({ period: 'June', year: 2026 });
    expect(r.siblings).toEqual([
      { period: 'April', year: 2026 },
      { period: 'May', year: 2026 },
    ]);
  });

  it('Half-Yearly assigned in March (Jan–Jun) → terminal June, siblings [Mar, Apr, May]', () => {
    const r = buildSiblingPeriods({
      frequency: 'Half-Yearly',
      assignedMonth: 'March',
      reviewYear: 2026,
    });
    expect(r.terminal).toEqual({ period: 'June', year: 2026 });
    expect(r.siblings.map(s => s.period)).toEqual(['March', 'April', 'May']);
  });

  it('Quarterly assigned in November (Oct-Dec) → terminal December, siblings [November]', () => {
    const r = buildSiblingPeriods({
      frequency: 'Quarterly',
      assignedMonth: 'November',
      reviewYear: 2026,
    });
    expect(r.terminal).toEqual({ period: 'December', year: 2026 });
    expect(r.siblings).toEqual([{ period: 'November', year: 2026 }]);
  });

  it('Monthly returns no siblings', () => {
    const r = buildSiblingPeriods({
      frequency: 'Monthly',
      assignedMonth: 'May',
      reviewYear: 2026,
    });
    expect(r.isMultiMonth).toBe(false);
    expect(r.siblings).toEqual([]);
  });

  it('Daily returns no siblings', () => {
    const r = buildSiblingPeriods({
      frequency: 'Daily',
      assignedMonth: 'May',
      reviewYear: 2026,
    });
    expect(r.isMultiMonth).toBe(false);
    expect(r.siblings).toEqual([]);
  });

  it('Bi-Monthly assigned in May (May-Jun cycle) → terminal June, siblings [May]', () => {
    const r = buildSiblingPeriods({
      frequency: 'Bi-Monthly',
      assignedMonth: 'May',
      reviewYear: 2026,
    });
    expect(r.terminal.period).toBe('June');
    expect(r.siblings.map(s => s.period)).toEqual(['May']);
  });
});
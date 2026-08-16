import { describe, it, expect } from 'vitest';
import {
  resolveEditSpan, spanModesAvailable, isPastPeriod, aggregateSpan, describeSpan, toTarget,
} from '@/components/admin/bu-console/groupEditSpan';

const today = new Date('2026-08-04T00:00:00Z');

describe('ADR-291 — group edit span resolution', () => {
  it('this month only returns a single target', () => {
    expect(resolveEditSpan(toTarget('August', 2026), 'this', 3, today))
      .toEqual([{ month: 'August', year: 2026 }]);
  });

  it('forward runs to June of the fiscal year (July-June)', () => {
    const t = resolveEditSpan(toTarget('August', 2026), 'forward', 3, today);
    expect(t[0]).toEqual({ month: 'August', year: 2026 });
    expect(t[t.length - 1]).toEqual({ month: 'June', year: 2027 });
    expect(t).toHaveLength(11);
  });

  it('forward from a late month wraps the calendar year correctly', () => {
    const t = resolveEditSpan(toTarget('November', 2026), 'forward', 3, today);
    expect(t.map(x => `${x.month} ${x.year}`)).toEqual([
      'November 2026', 'December 2026', 'January 2027', 'February 2027',
      'March 2027', 'April 2027', 'May 2027', 'June 2027',
    ]);
  });

  it('next N months is capped at 12 and counts inclusively', () => {
    expect(resolveEditSpan(toTarget('August', 2026), 'next_n', 3, today)).toHaveLength(3);
    expect(resolveEditSpan(toTarget('August', 2026), 'next_n', 99, today)).toHaveLength(12);
  });

  it('never touches past months', () => {
    expect(isPastPeriod(toTarget('July', 2026), today)).toBe(true);
    expect(resolveEditSpan(toTarget('July', 2026), 'forward', 5, today))
      .toEqual([{ month: 'July', year: 2026 }]);
    expect(spanModesAvailable(toTarget('July', 2026), today)).toEqual(['this']);
    expect(spanModesAvailable(toTarget('August', 2026), today)).toEqual(['this', 'forward', 'next_n']);
  });

  it('describes the span for the operator', () => {
    const t = resolveEditSpan(toTarget('August', 2026), 'next_n', 3, today);
    expect(describeSpan(t)).toBe('Aug, Sep, Oct 2026 — 3 periods');
  });
});

describe('ADR-291 — span aggregation', () => {
  it('sums preview counts and counts months with work', () => {
    const totals = aggregateSpan([
      { target: toTarget('August', 2026), result: { will_write: 41, will_skip: 2 } },
      { target: toTarget('September', 2026), result: { will_write: 0, will_skip: 0 } },
      { target: toTarget('October', 2026), result: { will_write: 5, will_skip: 1 } },
    ]);
    expect(totals).toEqual({ willWrite: 46, willSkip: 3, updated: 0, monthsWithWork: 2, monthsFailed: 0 });
  });

  it('counts failed months separately and ignores their numbers', () => {
    const totals = aggregateSpan([
      { target: toTarget('August', 2026), result: { updated: 10 } },
      { target: toTarget('September', 2026), result: null, error: 'rpc failed' },
    ]);
    expect(totals.updated).toBe(10);
    expect(totals.monthsFailed).toBe(1);
  });
});

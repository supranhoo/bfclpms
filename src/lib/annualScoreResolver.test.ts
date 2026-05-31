import { describe, it, expect } from 'vitest';
import { resolveAnnualScore, type MonthlyScore } from './annualScoreResolver';

const ms = (month: number, year: number, score: number | null): MonthlyScore => ({ month, year, score });

describe('resolveAnnualScore', () => {
  const sample: MonthlyScore[] = [
    ms(7, 2024, 4.0), ms(8, 2024, 3.5), ms(9, 2024, 4.5), ms(10, 2024, null),
    ms(11, 2024, 4.0), ms(12, 2024, 4.2), ms(1, 2025, 4.8), ms(2, 2025, 4.6),
    ms(3, 2025, 4.7), ms(4, 2025, 4.9), ms(5, 2025, 4.5), ms(6, 2025, 4.3),
  ];

  it('avg_all excludes nulls', () => {
    const r = resolveAnnualScore(sample, { method: 'avg_all' });
    expect(r.monthsConsidered).toBe(11);
    expect(r.monthsExcluded).toBe(1);
    expect(r.annualScore).toBeCloseTo(4.3636, 3);
  });

  it('last_6 takes the last 6 fiscal months', () => {
    const r = resolveAnnualScore(sample, { method: 'last_6' });
    expect(r.monthsConsidered).toBe(6);
  });

  it('custom uses only selected calendar months', () => {
    const r = resolveAnnualScore(sample, { method: 'custom', customMonths: [1, 2, 3] });
    expect(r.monthsConsidered).toBe(3);
    expect(r.annualScore).toBeCloseTo((4.8 + 4.6 + 4.7) / 3, 4);
  });

  it('returns null when no valid months', () => {
    const r = resolveAnnualScore([ms(7, 2024, null)], { method: 'avg_all' });
    expect(r.annualScore).toBeNull();
  });
});
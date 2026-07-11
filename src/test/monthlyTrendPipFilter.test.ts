import { describe, it, expect } from 'vitest';

// Mirrors MonthlyTrendView's PIP rule: an employee qualifies only when EVERY
// month in the selected range has a Final Score AND all those scores are
// strictly below the configured PIP threshold. A missing month disqualifies.
type Emp = {
  id: string;
  businessUnitId: string | null;
  monthlyFinalScores: Record<string, number | null>;
};

function isPip(emp: Emp, months: string[], threshold: number | null) {
  if (threshold == null || months.length === 0) return false;
  for (const k of months) {
    const v = emp.monthlyFinalScores[k];
    if (v == null || !Number.isFinite(v)) return false;
    if (v >= threshold) return false;
  }
  return true;
}

const MONTHS = ['2026-01', '2026-02', '2026-03'];

describe('MonthlyTrend PIP rule (every-month)', () => {
  it('qualifies when every month is strictly below threshold', () => {
    const e: Emp = { id: 'a', businessUnitId: null,
      monthlyFinalScores: { '2026-01': 1.2, '2026-02': 1.8, '2026-03': 1.9 } };
    expect(isPip(e, MONTHS, 2)).toBe(true);
  });

  it('disqualifies when any month meets or exceeds threshold', () => {
    const e: Emp = { id: 'b', businessUnitId: null,
      monthlyFinalScores: { '2026-01': 1.2, '2026-02': 2.0, '2026-03': 1.9 } };
    expect(isPip(e, MONTHS, 2)).toBe(false);
  });

  it('disqualifies when any month is missing', () => {
    const e: Emp = { id: 'c', businessUnitId: null,
      monthlyFinalScores: { '2026-01': 1.2, '2026-02': null, '2026-03': 1.9 } };
    expect(isPip(e, MONTHS, 2)).toBe(false);
  });

  it('requires a threshold to activate', () => {
    const e: Emp = { id: 'd', businessUnitId: null,
      monthlyFinalScores: { '2026-01': 1.0, '2026-02': 1.0, '2026-03': 1.0 } };
    expect(isPip(e, MONTHS, null)).toBe(false);
  });

  it('requires at least one month in range', () => {
    const e: Emp = { id: 'e', businessUnitId: null, monthlyFinalScores: {} };
    expect(isPip(e, [], 2)).toBe(false);
  });
});
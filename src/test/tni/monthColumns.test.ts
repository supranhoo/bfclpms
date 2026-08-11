/** ADR-253 — one report column per filtered month. */
import { describe, it, expect } from 'vitest';
import { monthColumnLabel, scoreForMonth, type QualifiedKpiRow } from '@/lib/tni/tniQualification';

const ev: QualifiedKpiRow = {
  employee_id: 'e1',
  kpi_key: 'kra||kpi',
  kra_name: 'kra',
  kpi_name: 'kpi',
  months: [
    { month: 'May', year: 2026, score: 1.9 },
    { month: 'June', year: 2026, score: 1.5 },
  ],
  scored_months: 2,
  worst_score: 1.5,
  latest_score: 1.5,
};

describe('TNI month columns', () => {
  it('labels each filtered month as MMM YYYY', () => {
    expect(monthColumnLabel({ month: 'April', year: 2026 })).toBe('Apr 2026');
  });

  it('returns the score for a scored month', () => {
    expect(scoreForMonth(ev, { month: 'June', year: 2026 })).toBe(1.5);
  });

  it('returns null for a month with no score in the range', () => {
    expect(scoreForMonth(ev, { month: 'April', year: 2026 })).toBeNull();
  });

  it('returns null when there is no evidence at all', () => {
    expect(scoreForMonth(undefined, { month: 'June', year: 2026 })).toBeNull();
  });
});

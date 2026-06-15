import { describe, it, expect } from 'vitest';
import {
  aggregateMonthly, selectMonths, computeCarryValue, computeCarryRating, computeCarryContribution,
  pickScore, calendarYearForMonth, FY_MONTHS,
} from './carryKraScore';
import { KPI_SCALE_MAX } from '@/lib/annualReview/fiscalYear';

const row = (overrides: Record<string, unknown> = {}) => ({
  kpi_id: 'k', is_na: false,
  final_score: null, manager_score: null, auditor_score: null, self_score: null,
  kpis: { employee_id: 'e', review_period: 'July', review_year: 2025, weightage: 10 },
  ...overrides,
}) as any;

describe('carryKraScore', () => {
  it('calendarYearForMonth maps fiscal year correctly', () => {
    expect(calendarYearForMonth('July', 2025)).toBe(2025);
    expect(calendarYearForMonth('December', 2025)).toBe(2025);
    expect(calendarYearForMonth('January', 2025)).toBe(2026);
    expect(calendarYearForMonth('June', 2025)).toBe(2026);
  });

  it('pickScore cascades final → auditor → manager → self', () => {
    expect(pickScore({ final_score: 9, auditor_score: 8, manager_score: 7, self_score: 6 })).toBe(9);
    expect(pickScore({ final_score: null, auditor_score: 8, manager_score: 7, self_score: 6 })).toBe(8);
    expect(pickScore({ final_score: null, auditor_score: null, manager_score: 7, self_score: 6 })).toBe(7);
    expect(pickScore({ final_score: null, auditor_score: null, manager_score: null, self_score: 6 })).toBe(6);
    expect(pickScore({ final_score: null, auditor_score: null, manager_score: null, self_score: null })).toBeNull();
  });

  it('aggregateMonthly weights by kpi weightage and respects fiscal-year mapping', () => {
    const rows = [
      row({ final_score: 80, kpis: { employee_id: 'e', review_period: 'July', review_year: 2025, weightage: 10 } }),
      row({ final_score: 60, kpis: { employee_id: 'e', review_period: 'July', review_year: 2025, weightage: 30 } }),
      // January 2026 belongs to FY2025
      row({ final_score: 90, kpis: { employee_id: 'e', review_period: 'January', review_year: 2026, weightage: 5 } }),
      // January 2025 belongs to FY2024 — should be ignored
      row({ final_score: 10, kpis: { employee_id: 'e', review_period: 'January', review_year: 2025, weightage: 5 } }),
      // N/A excluded
      row({ is_na: true, final_score: 0, kpis: { employee_id: 'e', review_period: 'August', review_year: 2025, weightage: 10 } }),
    ];
    const monthly = aggregateMonthly(rows, 2025, true);
    const byMonth = Object.fromEntries(monthly.map((m) => [m.month, m]));
    expect(byMonth.July.avg).toBe(+((80 * 10 + 60 * 30) / 40).toFixed(2)); // 65
    expect(byMonth.July.kpiCount).toBe(2);
    // New derived display fields: totalScore = weighted, outOf = weight × 5, percentage = totalScore/outOf × 100
    expect(byMonth.July.totalScore).toBe(80 * 10 + 60 * 30); // 2600
    expect(byMonth.July.outOf).toBe(40 * 5);                 // 200
    expect(byMonth.July.percentage).toBe(+((2600 / 200) * 100).toFixed(2)); // 1300 (test uses out-of-scale scores)
    expect(byMonth.January.avg).toBe(90);
    expect(byMonth.January.totalScore).toBe(90 * 5);
    expect(byMonth.January.outOf).toBe(5 * 5);
    expect(byMonth.January.percentage).toBe(+((450 / 25) * 100).toFixed(2));
    expect(byMonth.August.avg).toBeNull();
    expect(byMonth.August.kpiCount).toBe(0);
    expect(byMonth.August.totalScore).toBeNull();
    expect(byMonth.August.outOf).toBeNull();
    expect(byMonth.August.percentage).toBeNull();
    expect(monthly).toHaveLength(12);
    expect(monthly[0].month).toBe('July');
    expect(monthly[11].month).toBe('June');
  });

  it('selectMonths handles all three aggregation modes', () => {
    const monthly = FY_MONTHS.map((m, i) => ({ month: m, avg: i * 10, kpiCount: 1 }));
    expect(selectMonths(monthly, { aggregation: 'overall_avg' })).toHaveLength(12);
    expect(selectMonths(monthly, { aggregation: 'last_n_months', lastN: 3 }))
      .toEqual(monthly.slice(-3));
    expect(selectMonths(monthly, { aggregation: 'selected_months', months: ['July', 'June'] }))
      .toEqual([monthly[0], monthly[11]]);
  });

  it('computeCarryValue averages monthly avgs and ignores null months', () => {
    const monthly = [
      { month: 'July', avg: 80, kpiCount: 1 },
      { month: 'August', avg: null, kpiCount: 0 },
      { month: 'September', avg: 60, kpiCount: 1 },
    ] as any;
    expect(computeCarryValue(monthly, { aggregation: 'overall_avg' })).toBe(70);
    expect(computeCarryValue([], { aggregation: 'overall_avg' })).toBe(0);
  });

  it('computeCarryRating returns the raw 0..KPI_SCALE_MAX rating', () => {
    const monthly = [
      { month: 'July', avg: 3, kpiCount: 1 },
      { month: 'August', avg: null, kpiCount: 0 },
      { month: 'September', avg: 4, kpiCount: 1 },
    ] as any;
    const rating = computeCarryRating(monthly, { aggregation: 'overall_avg' });
    expect(rating).toBe(3.5);
    expect(rating).toBeLessThanOrEqual(KPI_SCALE_MAX);
  });

  it('computeCarryContribution scales (rating / 5) * weight', () => {
    expect(computeCarryContribution(5, 100)).toBe(100);
    expect(computeCarryContribution(3.44, 100)).toBe(68.8);
    expect(computeCarryContribution(3.5, 40)).toBe(28);
    expect(computeCarryContribution(0, 100)).toBe(0);
    expect(computeCarryContribution(4, 0)).toBe(0);
    expect(computeCarryContribution(Number.NaN, 100)).toBe(0);
  });

  it('regression — rating is NEVER persisted into appraisal totals (scaling happens in computeCarryContribution)', () => {
    // The old contract returned the raw 0..5 rating as `value`, silently
    // under-counting by 20×. Pin the new behavior so future refactors notice.
    const rating = 3.44;
    const weight = 100;
    const old = rating;                                  // pre-fix: 3.44 ❌
    const fixed = computeCarryContribution(rating, weight); // post-fix: 68.8 ✅
    expect(old).not.toBe(fixed);
    expect(fixed).toBe(68.8);
  });
});
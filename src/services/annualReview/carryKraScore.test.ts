import { describe, it, expect } from 'vitest';
import {
  aggregateMonthly, selectMonths, computeCarryValue, pickScore, calendarYearForMonth, FY_MONTHS,
} from './carryKraScore';

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
    expect(byMonth.January.avg).toBe(90);
    expect(byMonth.August.avg).toBeNull();
    expect(byMonth.August.kpiCount).toBe(0);
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
});
/**
 * Phase 10 — Unit tests for the v2 SSOT helpers in
 * `@/lib/safetyAnalytics`: `aggregateMonthlyTrend`, `monthLabel`,
 * `heatmapIntensity`.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateMonthlyTrend,
  heatmapIntensity,
  monthLabel,
  type MonthlyTrendRow,
} from '@/lib/safetyAnalytics';

function row(over: Partial<MonthlyTrendRow>): MonthlyTrendRow {
  return {
    month_start: '2026-05-01',
    period_year: 2026,
    period_month: 5,
    business_unit_id: null,
    total_count: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    recordable_count: 0,
    closed_count: 0,
    ...over,
  };
}

describe('aggregateMonthlyTrend', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateMonthlyTrend([])).toEqual([]);
  });

  it('sums counts across business units for the same month', () => {
    const out = aggregateMonthlyTrend([
      row({ business_unit_id: 'a', critical_count: 1, total_count: 2 }),
      row({ business_unit_id: 'b', critical_count: 3, total_count: 4 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].critical).toBe(4);
    expect(out[0].total).toBe(6);
    expect(out[0].label).toMatch(/May/);
  });

  it('sorts months chronologically', () => {
    const out = aggregateMonthlyTrend([
      row({ month_start: '2026-05-01', period_month: 5 }),
      row({ month_start: '2026-03-01', period_month: 3 }),
      row({ month_start: '2026-04-01', period_month: 4 }),
    ]);
    expect(out.map((d) => d.month_start)).toEqual([
      '2026-03-01', '2026-04-01', '2026-05-01',
    ]);
  });
});

describe('monthLabel', () => {
  it('formats year/month as short label', () => {
    expect(monthLabel(2026, 1)).toBe("Jan '26");
    expect(monthLabel(2026, 12)).toBe("Dec '26");
  });

  it('clamps invalid month inputs without throwing', () => {
    expect(() => monthLabel(2026, 0)).not.toThrow();
  });
});

describe('heatmapIntensity', () => {
  it('returns 0 when max is zero', () => {
    expect(heatmapIntensity(5, 0)).toBe(0);
  });

  it('returns 0 for null / negative / zero values', () => {
    expect(heatmapIntensity(null, 10)).toBe(0);
    expect(heatmapIntensity(undefined, 10)).toBe(0);
    expect(heatmapIntensity(0, 10)).toBe(0);
    expect(heatmapIntensity(-3, 10)).toBe(0);
  });

  it('normalises value to 0..1', () => {
    expect(heatmapIntensity(5, 10)).toBe(0.5);
    expect(heatmapIntensity(10, 10)).toBe(1);
    expect(heatmapIntensity(20, 10)).toBe(1); // clamps
  });
});
/**
 * Regression: Self-mode "pending KPI" banner must exclude non-anchor
 * placeholder rows of multi-month cycles (POLICY §54 v3 UX Corollary).
 *
 * Mirrors the in-component pendingPeriods reducer in
 * src/components/review/UnifiedScorecard.tsx so any drift between the helper
 * and the UI is caught by CI.
 */
import { describe, it, expect } from 'vitest';
import { buildCycleScopeLabel } from '@/lib/frequencyUtils';

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MockKpi {
  status: string;
  review_period: string;
  review_year: number;
  frequency: string | null;
  frequency_cycle_start?: string | null;
}

/** Reducer kept in lockstep with UnifiedScorecard pendingPeriods memo. */
function derivePendingCounts(
  kpis: MockKpi[],
  selectedPeriod: string,
  selectedYear: number,
): Map<string, number> {
  const actionable = ['kra_set', 'self_review'];
  const currentIdx = MONTH_ORDER.indexOf(selectedPeriod);
  const map = new Map<string, number>();
  for (const k of kpis) {
    if (!actionable.includes(k.status)) continue;
    const scope = buildCycleScopeLabel(
      k.frequency,
      k.review_period,
      k.review_year,
      k.frequency_cycle_start ?? null,
    );
    if (scope.isMultiMonth) {
      if (scope.anchorMonth !== k.review_period || scope.anchorYear !== k.review_year) continue;
    }
    const mi = MONTH_ORDER.indexOf(k.review_period);
    const earlier = k.review_year < selectedYear ||
      (k.review_year === selectedYear && mi < currentIdx && mi >= 0);
    if (!earlier) continue;
    const key = `${k.review_period}-${k.review_year}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

describe('pendingPeriods — multi-month anchor filter', () => {
  it('counts prior-month Monthly kra_set as pending', () => {
    const counts = derivePendingCounts(
      [{ status: 'kra_set', review_period: 'April', review_year: 2026, frequency: 'Monthly' }],
      'May', 2026,
    );
    expect(counts.get('April-2026')).toBe(1);
  });

  it('does NOT count Quarterly non-anchor placeholder (April of Apr–Jun)', () => {
    const counts = derivePendingCounts(
      [{ status: 'kra_set', review_period: 'April', review_year: 2026, frequency: 'Quarterly' }],
      'May', 2026,
    );
    expect(counts.size).toBe(0);
  });

  it('counts Quarterly anchor month (June of Apr–Jun) when viewed from July', () => {
    const counts = derivePendingCounts(
      [{ status: 'kra_set', review_period: 'June', review_year: 2026, frequency: 'Quarterly' }],
      'July', 2026,
    );
    expect(counts.get('June-2026')).toBe(1);
  });

  it('mixed batch — 1 Monthly + 2 Quarterly placeholders + 1 Quarterly anchor => 2 counted', () => {
    const counts = derivePendingCounts(
      [
        { status: 'kra_set', review_period: 'May', review_year: 2026, frequency: 'Monthly' },
        { status: 'kra_set', review_period: 'April', review_year: 2026, frequency: 'Quarterly' },
        { status: 'kra_set', review_period: 'May', review_year: 2026, frequency: 'Quarterly' },
        { status: 'kra_set', review_period: 'June', review_year: 2026, frequency: 'Quarterly' },
      ],
      'July', 2026,
    );
    // May Monthly (1) + June Quarterly anchor (1). April + May Quarterly siblings dropped.
    expect(counts.get('May-2026')).toBe(1);
    expect(counts.get('June-2026')).toBe(1);
    expect(counts.get('April-2026')).toBeUndefined();
    expect(Array.from(counts.values()).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('ignores non-actionable statuses (approved, manager_check)', () => {
    const counts = derivePendingCounts(
      [
        { status: 'approved', review_period: 'April', review_year: 2026, frequency: 'Monthly' },
        { status: 'manager_check', review_period: 'April', review_year: 2026, frequency: 'Monthly' },
      ],
      'May', 2026,
    );
    expect(counts.size).toBe(0);
  });
});
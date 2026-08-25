/**
 * ADR-316 — per-KPI rhythm, fiscal ordering and bottom-line totals.
 *
 * Mock data mirrors the Excel sheet users maintain today: a Jul–Jun cycle of
 * Target / Achieved / Achievement % / Rating rows with a bottom line.
 */
import { describe, expect, it } from 'vitest';
import {
  computeTotalsRow, defaultTotalRule, effectiveTotalRule, fiscalPeriodIndex,
  granularityForFrequency, sortRowsFiscal,
  type LedgerColumn,
} from '@/lib/review/kpiLedgerModel';

const col = (over: Partial<LedgerColumn>): LedgerColumn => ({
  column_key: 'c', label: 'C', data_type: 'number', is_required: false, is_key: false,
  editable_by: 'provider', sort_order: 10, ...over,
});

const COLUMNS: LedgerColumn[] = [
  col({ column_key: 'target', label: 'Target' }),
  col({ column_key: 'achieved', label: 'Achieved' }),
  col({ column_key: 'ach_pct', label: 'Achievement %', data_type: 'formula', formula: 'achieved / target * 100' }),
  col({ column_key: 'rating', label: 'Rating', total_rule: 'avg' }),
  col({ column_key: 'remarks', label: 'Remarks', data_type: 'text' }),
];

const ROWS = [
  { review_period: 'August', review_year: 2025, scope_label: null, values: { target: 100, achieved: 90, rating: 3 } },
  { review_period: 'July', review_year: 2025, scope_label: null, values: { target: 100, achieved: 120, rating: 5 } },
  { review_period: 'January', review_year: 2026, scope_label: null, values: { target: 200, achieved: 150, rating: 2 } },
];

describe('granularityForFrequency', () => {
  it.each([
    ['Monthly', 'monthly'],
    ['Bi-Monthly', 'bi_monthly'],
    ['Quarterly', 'quarterly'],
    ['Half-Yearly', 'half_yearly'],
    ['Yearly', 'yearly'],
    ['Annual', 'yearly'],
    ['Weekly', 'weekly'],
    ['Event', 'event'],
  ])('maps %s to %s', (freq, expected) => {
    expect(granularityForFrequency(freq)).toBe(expected);
  });

  it('falls back to monthly for missing or unknown frequencies', () => {
    expect(granularityForFrequency(null)).toBe('monthly');
    expect(granularityForFrequency('Whenever')).toBe('monthly');
    expect(granularityForFrequency('Daily')).toBe('monthly');
  });
});

describe('fiscal ordering', () => {
  it('ranks July first and June last', () => {
    expect(fiscalPeriodIndex('July')).toBe(0);
    expect(fiscalPeriodIndex('June')).toBe(11);
    expect(fiscalPeriodIndex('Nonsense')).toBe(99);
  });

  it('sorts a Jul–Jun cycle across two calendar years', () => {
    expect(sortRowsFiscal(ROWS).map(r => r.review_period)).toEqual(['July', 'August', 'January']);
  });
});

describe('totals', () => {
  it('defaults by data type', () => {
    expect(defaultTotalRule(col({}))).toBe('sum');
    expect(defaultTotalRule(col({ data_type: 'percent' }))).toBe('avg');
    expect(defaultTotalRule(col({ data_type: 'formula' }))).toBe('derived');
    expect(defaultTotalRule(col({ data_type: 'text' }))).toBe('none');
  });

  it('honours an explicit rule over the default', () => {
    expect(effectiveTotalRule(col({ total_rule: 'avg' }))).toBe('avg');
  });

  it('sums values, averages ratings and recalculates the derived ratio', () => {
    const t = computeTotalsRow(COLUMNS, ROWS);
    expect(t.target).toBe(400);
    expect(t.achieved).toBe(360);
    expect(t.rating).toBe(3.3333);
    // Recalculated from the totals, not a sum of monthly percentages.
    expect(t.ach_pct).toBe(90);
    expect(t.remarks).toBeNull();
  });

  it('returns nulls when there is nothing entered', () => {
    const t = computeTotalsRow(COLUMNS, []);
    expect(t.target).toBeNull();
    expect(t.ach_pct).toBeNull();
  });

  it('ignores non-numeric noise in a numeric column', () => {
    const t = computeTotalsRow(COLUMNS, [{ values: { target: 'n/a', achieved: 50 } }]);
    expect(t.target).toBeNull();
    expect(t.achieved).toBe(50);
  });
});

/**
 * ADR-309 — KPI Data Ledger model tests.
 * Mock data mirrors the real Production and Power Gen sheets so the roll-up and
 * exception rules are exercised against realistic shapes.
 */
import { describe, expect, it } from 'vitest';
import {
  computeRollup, detectExceptions, evaluateFormula, formatCell, isValidationLive,
  scopeLabelOf, toNumber, withDerivedValues,
  type LedgerColumn, type LedgerRow,
} from '@/lib/review/kpiLedgerModel';

const columns: LedgerColumn[] = [
  { column_key: 'target', label: 'Target', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 10 },
  { column_key: 'achieved', label: 'Achieved', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 20 },
  { column_key: 'achievement_pct', label: 'Achievement %', data_type: 'formula', formula: 'achieved / target * 100', is_required: false, is_key: false, editable_by: 'system', sort_order: 30 },
  { column_key: 'incentive_pct', label: 'Prod Incentive %', data_type: 'percent', is_required: false, is_key: false, editable_by: 'provider', sort_order: 40 },
];

function row(period: string, target: number | null, achieved: number | null, extra: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: `row-${period}`,
    dataset_id: 'ds-1',
    review_period: period,
    review_year: 2025,
    period_start: `2025-${period}-01`,
    impact_scope: {},
    values: { target, achieved, incentive_pct: 3.08 },
    revision: 1,
    scope_label: 'CLU',
    ...extra,
  };
}

const productionRows: LedgerRow[] = [
  row('07', 5156, 5020),
  row('08', 6249, 5560),
  row('09', 6000, 6300),
];

const def = {
  rollup_rule: 'sum_ratio' as const,
  value_column_key: 'achieved',
  target_column_key: 'target',
  weight_column_key: null,
};

describe('toNumber', () => {
  it('parses formatted numbers and rejects junk', () => {
    expect(toNumber('5,156')).toBe(5156);
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('evaluateFormula', () => {
  it('computes achievement percentage from sibling columns', () => {
    expect(evaluateFormula('achieved / target * 100', { achieved: 5020, target: 5156 })).toBeCloseTo(97.3623, 3);
  });

  it('returns null when an input is missing rather than guessing', () => {
    expect(evaluateFormula('achieved / target * 100', { achieved: 5020 })).toBeNull();
  });

  it('refuses anything that is not arithmetic', () => {
    expect(evaluateFormula('fetch("/x")', { fetch: 1 })).toBeNull();
    expect(evaluateFormula('achieved; globalThis', { achieved: 2 })).toBeNull();
  });

  it('survives divide-by-zero without throwing', () => {
    expect(evaluateFormula('achieved / target', { achieved: 5, target: 0 })).toBeNull();
  });
});

describe('withDerivedValues', () => {
  it('recomputes only the derived columns', () => {
    const out = withDerivedValues(columns, { target: 100, achieved: 90, incentive_pct: 3 });
    expect(out.achievement_pct).toBe(90);
    expect(out.incentive_pct).toBe(3);
  });
});

describe('computeRollup', () => {
  it('sum_ratio mirrors sum(achieved)/sum(target) as a percentage', () => {
    const res = computeRollup(def, productionRows);
    expect(res.value).toBeCloseTo(96.98, 1);
    expect(res.rowCount).toBe(3);
  });

  it('returns null with an honest note when there are no rows', () => {
    const res = computeRollup(def, []);
    expect(res.value).toBeNull();
    expect(res.working).toMatch(/No rows/i);
  });

  it('refuses to divide by a zero target total', () => {
    const res = computeRollup(def, [row('07', 0, 500)]);
    expect(res.value).toBeNull();
    expect(res.working).toMatch(/zero/i);
  });

  it('supports sum, avg, last, max and min', () => {
    expect(computeRollup({ ...def, rollup_rule: 'sum' }, productionRows).value).toBe(16880);
    expect(computeRollup({ ...def, rollup_rule: 'avg' }, productionRows).value).toBeCloseTo(5626.67, 1);
    expect(computeRollup({ ...def, rollup_rule: 'last' }, productionRows).value).toBe(6300);
    expect(computeRollup({ ...def, rollup_rule: 'max' }, productionRows).value).toBe(6300);
    expect(computeRollup({ ...def, rollup_rule: 'min' }, productionRows).value).toBe(5020);
  });

  it('weights by the configured weight column', () => {
    const weighted = computeRollup(
      { rollup_rule: 'weighted', value_column_key: 'achieved', target_column_key: 'target', weight_column_key: 'target' },
      productionRows,
    );
    expect(weighted.value).toBeCloseTo(5655.13, 1);
  });
});

describe('detectExceptions', () => {
  it('flags a missing achieved value', () => {
    const flags = detectExceptions(def, columns, [row('07', 5000, null)]);
    expect(flags.some((f) => f.code === 'no_value')).toBe(true);
    expect(flags.some((f) => f.code === 'missing_required')).toBe(true);
  });

  it('flags a zero target and an implausible achievement', () => {
    const zero = detectExceptions(def, columns, [row('07', 0, 100)]);
    expect(zero.some((f) => f.code === 'zero_target')).toBe(true);
    const wild = detectExceptions(def, columns, [row('08', 10, 100)]);
    expect(wild.some((f) => f.code === 'out_of_range')).toBe(true);
  });

  it('flags two rows covering the same period and scope', () => {
    const dup = detectExceptions(def, columns, [
      row('07', 100, 90),
      { ...row('07', 100, 90), id: 'row-dup' },
    ]);
    expect(dup.some((f) => f.code === 'duplicate_scope')).toBe(true);
  });

  it('stays quiet on a clean period', () => {
    expect(detectExceptions(def, columns, productionRows)).toHaveLength(0);
  });
});

describe('formatCell', () => {
  it('renders units, percentages and blanks honestly', () => {
    expect(formatCell(columns[0], 5156)).toBe('5,156.00');
    expect(formatCell(columns[3], 3.08)).toBe('3.08%');
    expect(formatCell(columns[0], null)).toBe('—');
  });
});

describe('scopeLabelOf', () => {
  it('prefers the stored label, then the org name, then whole organisation', () => {
    expect(scopeLabelOf({ scope_label: 'CLU' } as LedgerRow)).toBe('CLU');
    expect(
      scopeLabelOf({ scope_label: null, department_id: 'd1' } as LedgerRow, { departments: { d1: 'Executive' } }),
    ).toBe('Executive');
    expect(scopeLabelOf({ scope_label: null } as LedgerRow)).toBe('Whole organisation');
  });
});

describe('isValidationLive', () => {
  it('only counts a validation that has not been invalidated', () => {
    const base = { id: 'v', dataset_id: 'ds-1', review_period: '07', review_year: 2025, row_count: 3, validated_at: 'now' };
    expect(isValidationLive({ ...base, verdict: 'validated' } as any)).toBe(true);
    expect(isValidationLive({ ...base, verdict: 'validated', invalidated_at: 'later' } as any)).toBe(false);
    expect(isValidationLive({ ...base, verdict: 'rejected' } as any)).toBe(false);
    expect(isValidationLive(null)).toBe(false);
  });
});

/**
 * ADR-318 / POLICY §KPI-LEDGER-PERIOD-OWNERSHIP.
 * A ledger row owns its period; the console header only seeds defaults.
 */
import { describe, expect, it } from 'vitest';
import {
  diffHistoryGrid, fiscalMonthSlots, parsePeriodToken, shortPeriodLabel,
  type LedgerColumn,
} from '../kpiLedgerModel';

const columns: LedgerColumn[] = [
  { column_key: 'target', label: 'Target', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 10 },
  { column_key: 'achieved', label: 'Achieved', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 20 },
  { column_key: 'pct', label: 'Pro Ach %', data_type: 'formula', formula: 'achieved / target * 100', is_required: false, is_key: false, editable_by: 'system', sort_order: 30 },
];

describe('parsePeriodToken', () => {
  it('reads sheet-style tokens', () => {
    expect(parsePeriodToken('Jul-25')).toEqual({ period: 'July', year: 2025 });
    expect(parsePeriodToken('July 2025')).toEqual({ period: 'July', year: 2025 });
    expect(parsePeriodToken('jun-26')).toEqual({ period: 'June', year: 2026 });
    expect(parsePeriodToken('2025-07')).toEqual({ period: 'July', year: 2025 });
    expect(parsePeriodToken('07/2025')).toEqual({ period: 'July', year: 2025 });
  });

  it('reads a bare month with no year', () => {
    expect(parsePeriodToken('August')).toEqual({ period: 'August', year: null });
  });

  it('rejects nonsense', () => {
    expect(parsePeriodToken('')).toBeNull();
    expect(parsePeriodToken('Smarch 25')).toBeNull();
    expect(parsePeriodToken('13/2025')).toBeNull();
  });
});

describe('fiscalMonthSlots', () => {
  it('runs July of the start year to June of the next', () => {
    const slots = fiscalMonthSlots(2025);
    expect(slots).toHaveLength(12);
    expect(slots[0]).toEqual({ period: 'July', year: 2025 });
    expect(slots[6]).toEqual({ period: 'January', year: 2026 });
    expect(slots[11]).toEqual({ period: 'June', year: 2026 });
  });

  it('labels months the way the sheet reads', () => {
    expect(shortPeriodLabel('July', 2025)).toBe('Jul-25');
  });
});

describe('diffHistoryGrid', () => {
  const existing = [
    { id: 'r1', review_period: 'July', review_year: 2025, values: { target: 7175, achieved: 5996 } },
  ];

  it('classifies new, updated, unchanged and empty months', () => {
    const lines = diffHistoryGrid(columns, existing, {
      'July|2025': { target: '7175', achieved: '5996' },
      'September|2025': { target: '14350', achieved: '12508' },
    }, 2025);

    const byKey = Object.fromEntries(lines.map((l) => [`${l.period}|${l.year}`, l.kind]));
    expect(byKey['July|2025']).toBe('unchanged');
    expect(byKey['September|2025']).toBe('new');
    expect(byKey['August|2025']).toBe('empty');
    expect(byKey['June|2026']).toBe('empty');
  });

  it('flags a changed value on an existing month', () => {
    const lines = diffHistoryGrid(columns, existing, {
      'July|2025': { target: '7175', achieved: '6000' },
    }, 2025);
    const july = lines.find((l) => l.period === 'July')!;
    expect(july.kind).toBe('updated');
    expect(july.rowId).toBe('r1');
  });

  it('recomputes derived columns for each line', () => {
    const lines = diffHistoryGrid(columns, [], {
      'November|2025': { target: '14177', achieved: '14662' },
    }, 2025);
    const nov = lines.find((l) => l.period === 'November')!;
    expect(nov.year).toBe(2025);
    expect(Number(nov.values.pct)).toBeCloseTo(103.42, 1);
  });

  it('never writes months the officer left blank', () => {
    const lines = diffHistoryGrid(columns, [], {}, 2025);
    expect(lines.every((l) => l.kind === 'empty')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import {
  expandCycleWindowMonths,
  checkCycleAnchorConflict,
  type KpiRow,
} from '@/lib/cycleAnchorWindowConsistency';

const baseRow = (over: Partial<KpiRow>): KpiRow => ({
  employee_id: 'emp-1',
  kpi_name: 'KPI A',
  review_year: 2026,
  review_period: 'April',
  frequency: 'Quarterly',
  frequency_cycle_start: 'Apr-Jun',
  ...over,
});

describe('expandCycleWindowMonths', () => {
  it('expands Quarterly anchors', () => {
    expect(expandCycleWindowMonths('Quarterly', 'Apr-Jun')).toEqual(['April','May','June']);
    expect(expandCycleWindowMonths('Quarterly', 'Jul-Sep')).toEqual(['July','August','September']);
  });
  it('expands Bi-Monthly offset', () => {
    expect(expandCycleWindowMonths('Bi-Monthly', 'Feb-Mar')).toEqual(['February','March']);
  });
  it('expands Half-Yearly', () => {
    expect(expandCycleWindowMonths('Half-Yearly', 'Jan-Jun'))
      .toEqual(['January','February','March','April','May','June']);
  });
  it('wraps across year-end', () => {
    expect(expandCycleWindowMonths('Bi-Monthly', 'Dec-Jan')).toEqual(['December','January']);
  });
  it('returns [] for malformed input', () => {
    expect(expandCycleWindowMonths('Quarterly', 'Zzz-Yyy')).toEqual([]);
    expect(expandCycleWindowMonths('Monthly', 'Apr-Jun')).toEqual([]);
  });
});

describe('checkCycleAnchorConflict (ADR-091)', () => {
  it('allows Quarterly Apr-Jun insert when Jul-Sep cycle already exists', () => {
    // The V.A.V.S.S. Ganapathi Varma case: deleting June then rolling over
    // May→June with July/Aug/Sep rows already present must succeed.
    const existing: KpiRow[] = [
      baseRow({ review_period: 'July',      frequency_cycle_start: 'Jul-Sep' }),
      baseRow({ review_period: 'August',    frequency_cycle_start: 'Jul-Sep' }),
      baseRow({ review_period: 'September', frequency_cycle_start: 'Jul-Sep' }),
    ];
    const next = baseRow({ review_period: 'June', frequency_cycle_start: 'Apr-Jun' });
    expect(checkCycleAnchorConflict(next, existing)).toBeNull();
  });

  it('rejects same-window anchor disagreement (Sajid/Prabhat class)', () => {
    const existing: KpiRow[] = [
      baseRow({ review_period: 'April', frequency_cycle_start: 'Apr-Jun' }),
    ];
    const next = baseRow({ review_period: 'May', frequency_cycle_start: 'Mar-May' });
    // 'Mar-May' window covers April → conflicts with the existing Apr/Apr-Jun row.
    expect(checkCycleAnchorConflict(next, existing)).toBe('Apr-Jun');
  });

  it('allows offset Bi-Monthly series Feb-Mar across the year', () => {
    const existing: KpiRow[] = [
      baseRow({ frequency: 'Bi-Monthly', review_period: 'February', frequency_cycle_start: 'Feb-Mar' }),
      baseRow({ frequency: 'Bi-Monthly', review_period: 'March',    frequency_cycle_start: 'Feb-Mar' }),
    ];
    const next = baseRow({
      frequency: 'Bi-Monthly', review_period: 'April', frequency_cycle_start: 'Apr-May',
    });
    expect(checkCycleAnchorConflict(next, existing)).toBeNull();
  });

  it('ignores rows for a different employee/KPI/year/frequency', () => {
    const existing: KpiRow[] = [
      baseRow({ employee_id: 'other', review_period: 'May', frequency_cycle_start: 'Mar-May' }),
      baseRow({ kpi_name: 'KPI B',    review_period: 'May', frequency_cycle_start: 'Mar-May' }),
      baseRow({ review_year: 2025,    review_period: 'May', frequency_cycle_start: 'Mar-May' }),
      baseRow({ frequency: 'Monthly', review_period: 'May', frequency_cycle_start: null }),
    ];
    const next = baseRow({ review_period: 'May', frequency_cycle_start: 'Apr-Jun' });
    expect(checkCycleAnchorConflict(next, existing)).toBeNull();
  });

  it('returns null when next row has no anchor or non-multi frequency', () => {
    expect(checkCycleAnchorConflict(baseRow({ frequency_cycle_start: null }), [])).toBeNull();
    expect(checkCycleAnchorConflict(baseRow({ frequency: 'Monthly' }), [])).toBeNull();
  });
});
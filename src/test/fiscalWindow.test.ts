import { describe, it, expect } from 'vitest';
import {
  fiscalYearForMonth,
  isFiscalTuple,
  isKpiMonthInFiscalCycle,
  filterToFiscalWindow,
  fiscalStartYearOfKpi,
} from '@/lib/fiscalWindow';

// Canonical guard for BUG-044/045/046. Fiscal cycle 2025-26 = Jul 2025 .. Jun 2026.
describe('fiscalYearForMonth', () => {
  it('maps Jul–Dec to fiscalStartYear', () => {
    for (const m of ['July', 'August', 'September', 'October', 'November', 'December']) {
      expect(fiscalYearForMonth(m, 2025)).toBe(2025);
    }
  });
  it('maps Jan–Jun to fiscalStartYear + 1', () => {
    for (const m of ['January', 'February', 'March', 'April', 'May', 'June']) {
      expect(fiscalYearForMonth(m, 2025)).toBe(2026);
    }
  });
  it('returns null for unknown / null months', () => {
    expect(fiscalYearForMonth(null, 2025)).toBeNull();
    expect(fiscalYearForMonth('Marchember', 2025)).toBeNull();
  });
});

describe('isFiscalTuple', () => {
  it('rejects July with review_year = fiscalStartYear + 1 (the reported bleed bug)', () => {
    expect(isFiscalTuple('July', 2026, 2025)).toBe(false);
    expect(isFiscalTuple('July', 2025, 2025)).toBe(true);
  });
  it('rejects Jan with review_year = fiscalStartYear', () => {
    expect(isFiscalTuple('January', 2025, 2025)).toBe(false);
    expect(isFiscalTuple('January', 2026, 2025)).toBe(true);
  });
  it('rejects null review_year', () => {
    expect(isFiscalTuple('July', null, 2025)).toBe(false);
  });
});

describe('isKpiMonthInFiscalCycle (calendar-index variant)', () => {
  it('mirrors isFiscalTuple for the matrix path', () => {
    // Jul = calIdx 6
    expect(isKpiMonthInFiscalCycle(6, 2025, 2025)).toBe(true);
    expect(isKpiMonthInFiscalCycle(6, 2026, 2025)).toBe(false);
    // Jan = calIdx 0
    expect(isKpiMonthInFiscalCycle(0, 2026, 2025)).toBe(true);
    expect(isKpiMonthInFiscalCycle(0, 2025, 2025)).toBe(false);
  });
});

describe('filterToFiscalWindow', () => {
  it('drops rows outside the selected fiscal window', () => {
    const rows = [
      { p: 'July',     y: 2025 }, // in cycle 2025-26
      { p: 'July',     y: 2026 }, // in cycle 2026-27 — must be dropped
      { p: 'April',    y: 2026 }, // in cycle 2025-26
      { p: 'April',    y: 2025 }, // in cycle 2024-25 — must be dropped
      { p: 'December', y: 2025 }, // in cycle 2025-26
      { p: null,       y: 2025 }, // invalid — dropped
    ];
    const kept = filterToFiscalWindow(rows, 2025, r => r.p, r => r.y);
    expect(kept).toEqual([
      { p: 'July',     y: 2025 },
      { p: 'April',    y: 2026 },
      { p: 'December', y: 2025 },
    ]);
  });
});

describe('fiscalStartYearOfKpi', () => {
  it('inverts the mapping', () => {
    expect(fiscalStartYearOfKpi('July', 2025)).toBe(2025);
    expect(fiscalStartYearOfKpi('December', 2025)).toBe(2025);
    expect(fiscalStartYearOfKpi('January', 2026)).toBe(2025);
    expect(fiscalStartYearOfKpi('June', 2026)).toBe(2025);
  });
  it('returns null when inputs are invalid', () => {
    expect(fiscalStartYearOfKpi(null, 2025)).toBeNull();
    expect(fiscalStartYearOfKpi('July', null)).toBeNull();
    expect(fiscalStartYearOfKpi('Foo', 2025)).toBeNull();
  });
});

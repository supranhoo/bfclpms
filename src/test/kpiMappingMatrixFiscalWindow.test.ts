import { describe, it, expect } from 'vitest';
import { isKpiMonthInFiscalCycle } from '@/hooks/useAdminReports';

// BUG: KPI Mapping Matrix used to bleed rows from adjacent fiscal cycles into
// the wrong months (e.g. review_year=2026, review_period='July' was rendered
// under Jul of fiscal 2025-26 even though it belongs to fiscal 2026-27).
describe('isKpiMonthInFiscalCycle — fiscal window guard', () => {
  const FY = 2025; // fiscal 2025-26 spans Jul 2025 .. Jun 2026

  it('accepts Jul (calIdx 6) only when review_year === fiscalStartYear', () => {
    expect(isKpiMonthInFiscalCycle(6, 2025, FY)).toBe(true);
    expect(isKpiMonthInFiscalCycle(6, 2026, FY)).toBe(false); // the reported bug
  });

  it('accepts Dec (calIdx 11) only when review_year === fiscalStartYear', () => {
    expect(isKpiMonthInFiscalCycle(11, 2025, FY)).toBe(true);
    expect(isKpiMonthInFiscalCycle(11, 2026, FY)).toBe(false);
  });

  it('accepts Jan (calIdx 0) only when review_year === fiscalStartYear + 1', () => {
    expect(isKpiMonthInFiscalCycle(0, 2026, FY)).toBe(true);
    expect(isKpiMonthInFiscalCycle(0, 2025, FY)).toBe(false);
  });

  it('accepts Apr / May / Jun (calIdx 3..5) only when review_year === fiscalStartYear + 1', () => {
    for (const cm of [3, 4, 5]) {
      expect(isKpiMonthInFiscalCycle(cm, 2026, FY)).toBe(true);
      expect(isKpiMonthInFiscalCycle(cm, 2025, FY)).toBe(false);
    }
  });

  it('rejects rows with null review_year', () => {
    expect(isKpiMonthInFiscalCycle(6, null, FY)).toBe(false);
    expect(isKpiMonthInFiscalCycle(0, undefined, FY)).toBe(false);
  });
});

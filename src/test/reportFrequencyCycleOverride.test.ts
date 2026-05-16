import { describe, it, expect } from 'vitest';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';

/**
 * POLICY §128 — Reports MUST pass per-KPI `frequency_cycle_start` to
 * `isKpiLockedForPeriod`. Regression guard for the Sajid Raza
 * Mar-2026 score bug (114/257.5 instead of 314/492.5) where Bi-Monthly
 * KPIs on the offset `Feb-Mar` cycle were silently dropped because the
 * helper fell back to the default `Jan-Feb` cycle.
 */
describe('report frequency-cycle override (POLICY §128)', () => {
  it('Bi-Monthly Feb-Mar cycle: March is the active month, NOT locked', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'March', 2026, 'Feb-Mar')).toBe(false);
    expect(isKpiLockedForPeriod('Bi-Monthly', 'February', 2026, 'Feb-Mar')).toBe(true);
  });

  it('Bi-Monthly without override falls back to Jan-Feb default (March IS locked)', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'March', 2026)).toBe(true);
    expect(isKpiLockedForPeriod('Bi-Monthly', 'April', 2026)).toBe(false);
  });

  it('Quarterly Apr-Jun cycle: June is the active month, NOT locked', () => {
    expect(isKpiLockedForPeriod('Quarterly', 'June', 2026, 'Apr-Jun')).toBe(false);
    expect(isKpiLockedForPeriod('Quarterly', 'April', 2026, 'Apr-Jun')).toBe(true);
  });

  it('Half-Yearly Apr-Sep cycle: September is the active month, NOT locked', () => {
    expect(isKpiLockedForPeriod('Half-Yearly', 'September', 2026, 'Apr-Sep')).toBe(false);
    expect(isKpiLockedForPeriod('Half-Yearly', 'June', 2026, 'Apr-Sep')).toBe(true);
  });

  it('Yearly Apr-Mar cycle: March is the active month, NOT locked', () => {
    expect(isKpiLockedForPeriod('Yearly', 'March', 2026, 'Apr-Mar')).toBe(false);
    expect(isKpiLockedForPeriod('Yearly', 'December', 2026, 'Apr-Mar')).toBe(true);
  });
});
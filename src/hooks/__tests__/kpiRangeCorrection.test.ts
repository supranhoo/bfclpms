import { describe, it, expect } from 'vitest';
import { CORRECTION_FLOOR, monthNum, periodKey } from '@/hooks/useKpiRangeCorrection';

describe('ADR-330 range helpers', () => {
  it('maps month names to 1-based numbers', () => {
    expect(monthNum('January')).toBe(1);
    expect(monthNum('May')).toBe(5);
    expect(monthNum('December')).toBe(12);
  });

  it('orders periods across a fiscal boundary', () => {
    expect(periodKey('May', 2026)).toBe(202605);
    expect(periodKey('June', 2027)).toBeGreaterThan(periodKey('December', 2026));
    expect(periodKey('January', 2027)).toBeGreaterThan(periodKey('December', 2026));
  });

  it('treats anything before May 2026 as frozen', () => {
    expect(periodKey('April', 2026)).toBeLessThan(CORRECTION_FLOOR);
    expect(periodKey('May', 2026)).toBe(CORRECTION_FLOOR);
    expect(periodKey('July', 2026)).toBeGreaterThan(CORRECTION_FLOOR);
  });
});

import { describe, it, expect } from 'vitest';
import { enumeratePeriods, validateRange, MAX_RANGE_MONTHS } from './kpiScorecardRange';

describe('kpiScorecardRange', () => {
  it('single month range returns one entry', () => {
    const out = enumeratePeriods({ month: 'March', year: 2026 }, { month: 'March', year: 2026 });
    expect(out).toEqual([{ month: 'March', year: 2026 }]);
  });

  it('enumerates across calendar year boundary (Sep 2025 → Apr 2026)', () => {
    const out = enumeratePeriods({ month: 'September', year: 2025 }, { month: 'April', year: 2026 });
    expect(out.length).toBe(8);
    expect(out[0]).toEqual({ month: 'September', year: 2025 });
    expect(out[3]).toEqual({ month: 'December', year: 2025 });
    expect(out[4]).toEqual({ month: 'January', year: 2026 });
    expect(out[7]).toEqual({ month: 'April', year: 2026 });
  });

  it('returns empty list when to is before from', () => {
    const out = enumeratePeriods({ month: 'May', year: 2026 }, { month: 'March', year: 2026 });
    expect(out).toEqual([]);
  });

  describe('validateRange', () => {
    it('accepts 1-month and 12-month spans', () => {
      const one = validateRange({ month: 'March', year: 2026 }, { month: 'March', year: 2026 });
      expect(one).toEqual({ ok: true, count: 1, error: null });

      const twelve = validateRange({ month: 'April', year: 2025 }, { month: 'March', year: 2026 });
      expect(twelve.ok).toBe(true);
      expect(twelve.count).toBe(MAX_RANGE_MONTHS);
    });

    it('rejects reversed ranges', () => {
      const r = validateRange({ month: 'May', year: 2026 }, { month: 'March', year: 2026 });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/on or after/);
    });

    it('rejects ranges over 12 months', () => {
      const r = validateRange({ month: 'January', year: 2025 }, { month: 'March', year: 2026 });
      expect(r.ok).toBe(false);
      expect(r.count).toBe(15);
      expect(r.error).toMatch(/12 months/);
    });
  });
});
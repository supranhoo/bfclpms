import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getMonthNumber,
  getMonthName,
  getSubFrequency,
  isKpiLockedForPeriod,
  getActiveMonthForCycle,
  getCycleMonths,
  getCycleLabel,
  requiresSubPeriodSelection,
  hasMultiMonthCycle,
  normalizeFrequency,
  isCycleComplete,
} from './frequencyUtils';

describe('normalizeFrequency', () => {
  it('normalizes common variants', () => {
    expect(normalizeFrequency('Bimonthly')).toBe('Bi-Monthly');
    expect(normalizeFrequency('bimonthly')).toBe('Bi-Monthly');
    expect(normalizeFrequency('Bi-Monthly')).toBe('Bi-Monthly');
    expect(normalizeFrequency('quarterly')).toBe('Quarterly');
    expect(normalizeFrequency('Quarterly')).toBe('Quarterly');
    expect(normalizeFrequency('half-yearly')).toBe('Half-Yearly');
    expect(normalizeFrequency('HalfYearly')).toBe('Half-Yearly');
    expect(normalizeFrequency('Daily')).toBe('Daily');
    expect(normalizeFrequency('monthly')).toBe('Monthly');
  });

  it('returns null for null/undefined', () => {
    expect(normalizeFrequency(null)).toBeNull();
    expect(normalizeFrequency(undefined)).toBeNull();
  });

  it('passes through unknown values', () => {
    expect(normalizeFrequency('Custom')).toBe('Custom');
  });
});

describe('getMonthNumber', () => {
  it('returns correct number for all 12 months', () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    months.forEach((m, i) => {
      expect(getMonthNumber(m)).toBe(i + 1);
    });
  });

  it('returns 1 for invalid month name', () => {
    expect(getMonthNumber('InvalidMonth')).toBe(1);
  });
});

describe('getMonthName', () => {
  it('returns correct name for month 1', () => {
    expect(getMonthName(1)).toBe('January');
  });

  it('returns correct name for month 12', () => {
    expect(getMonthName(12)).toBe('December');
  });

  it('returns January for out-of-range', () => {
    expect(getMonthName(0)).toBe('January');
  });
});

describe('getSubFrequency', () => {
  it('returns Daily for Daily', () => {
    expect(getSubFrequency('Daily')).toBe('Daily');
  });

  it('returns quarter ranges for Quarterly', () => {
    expect(getSubFrequency('Quarterly')).toContain('Jan-Mar');
  });
});

describe('isKpiLockedForPeriod', () => {
  it('returns false for Monthly', () => {
    expect(isKpiLockedForPeriod('Monthly', 'January', 2026)).toBe(false);
  });

  it('locks odd months for Bi-Monthly', () => {
    expect(isKpiLockedForPeriod('Bi-Monthly', 'January', 2026)).toBe(true); // month 1 is odd
    expect(isKpiLockedForPeriod('Bi-Monthly', 'February', 2026)).toBe(false); // month 2 is even
  });

  it('locks non-quarter-end for Quarterly', () => {
    expect(isKpiLockedForPeriod('Quarterly', 'January', 2026)).toBe(true);
    expect(isKpiLockedForPeriod('Quarterly', 'March', 2026)).toBe(false);
  });

  it('locks non-half-end for Half-Yearly', () => {
    expect(isKpiLockedForPeriod('Half-Yearly', 'June', 2026)).toBe(false);
    expect(isKpiLockedForPeriod('Half-Yearly', 'December', 2026)).toBe(false);
    expect(isKpiLockedForPeriod('Half-Yearly', 'March', 2026)).toBe(true);
  });

  it('handles Yearly with Jan-Dec cycle', () => {
    expect(isKpiLockedForPeriod('Yearly', 'December', 2026)).toBe(false);
    expect(isKpiLockedForPeriod('Yearly', 'June', 2026)).toBe(true);
  });

  it('returns false for null frequency', () => {
    expect(isKpiLockedForPeriod(null, 'January', 2026)).toBe(false);
  });
});

describe('getCycleMonths', () => {
  it('returns single month for Monthly', () => {
    expect(getCycleMonths('Monthly', 'March', 2026)).toEqual(['March']);
  });

  it('returns 2 months for Bi-Monthly', () => {
    expect(getCycleMonths('Bi-Monthly', 'January', 2026)).toEqual(['January', 'February']);
  });

  it('returns 3 months for Quarterly', () => {
    expect(getCycleMonths('Quarterly', 'February', 2026)).toEqual(['January', 'February', 'March']);
  });

  it('returns 6 months for Half-Yearly', () => {
    const months = getCycleMonths('Half-Yearly', 'March', 2026);
    expect(months).toHaveLength(6);
    expect(months[0]).toBe('January');
    expect(months[5]).toBe('June');
  });

  it('returns all 12 months for Yearly', () => {
    expect(getCycleMonths('Yearly', 'March', 2026)).toHaveLength(12);
  });
});

describe('getCycleLabel', () => {
  it('returns month name for Monthly', () => {
    expect(getCycleLabel('Monthly', 'March', 2026)).toBe('March');
  });

  it('returns quarter label for Quarterly', () => {
    expect(getCycleLabel('Quarterly', 'February', 2026)).toBe('Q1');
  });

  it('returns H1/H2 for Half-Yearly', () => {
    expect(getCycleLabel('Half-Yearly', 'March', 2026)).toBe('H1');
    expect(getCycleLabel('Half-Yearly', 'September', 2026)).toBe('H2');
  });
});

describe('requiresSubPeriodSelection', () => {
  it('returns true for Daily and Weekly', () => {
    expect(requiresSubPeriodSelection('Daily')).toBe(true);
    expect(requiresSubPeriodSelection('Weekly')).toBe(true);
  });

  it('returns false for Monthly', () => {
    expect(requiresSubPeriodSelection('Monthly')).toBe(false);
  });
});

describe('hasMultiMonthCycle', () => {
  it('returns true for multi-month frequencies', () => {
    expect(hasMultiMonthCycle('Bi-Monthly')).toBe(true);
    expect(hasMultiMonthCycle('Quarterly')).toBe(true);
    expect(hasMultiMonthCycle('Half-Yearly')).toBe(true);
    expect(hasMultiMonthCycle('Yearly')).toBe(true);
  });

  it('returns false for single-month frequencies', () => {
    expect(hasMultiMonthCycle('Daily')).toBe(false);
    expect(hasMultiMonthCycle('Monthly')).toBe(false);
    expect(hasMultiMonthCycle(null)).toBe(false);
  });
});

describe('isCycleComplete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true for Monthly (no cycle gate)', () => {
    expect(isCycleComplete('Monthly', 'March', 2026)).toBe(true);
  });

  it('returns true for Daily (no cycle gate)', () => {
    expect(isCycleComplete('Daily', 'March', 2026)).toBe(true);
  });

  it('returns false for sibling month (Quarterly January)', () => {
    expect(isCycleComplete('Quarterly', 'January', 2026)).toBe(false);
  });

  it('returns false for terminal month when cycle not ended', () => {
    // March 2026 ends on March 31. If today is March 15, cycle not complete.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // March 15
    expect(isCycleComplete('Quarterly', 'March', 2026)).toBe(false);
    vi.useRealTimers();
  });

  it('returns true for terminal month when cycle has ended', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1)); // April 1
    expect(isCycleComplete('Quarterly', 'March', 2026)).toBe(true);
    vi.useRealTimers();
  });

  it('returns false for Bi-Monthly sibling (January)', () => {
    expect(isCycleComplete('Bi-Monthly', 'January', 2026)).toBe(false);
  });

  it('returns true for Bi-Monthly terminal (February) after month ends', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 1)); // March 1
    expect(isCycleComplete('Bi-Monthly', 'February', 2026)).toBe(true);
    vi.useRealTimers();
  });

  it('returns false for Half-Yearly sibling', () => {
    expect(isCycleComplete('Half-Yearly', 'March', 2026)).toBe(false);
  });

  it('returns true for null frequency', () => {
    expect(isCycleComplete(null, 'March', 2026)).toBe(true);
  });
});

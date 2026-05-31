import { describe, it, expect } from 'vitest';
import { applyIncrementMethod } from './incrementMethodApplier';

describe('applyIncrementMethod', () => {
  it('full returns base unchanged', () => {
    expect(applyIncrementMethod({ method: 'full', basePercent: 10, monthsServed: 5 }).eligiblePercent).toBe(10);
  });

  it('prorated_doj computes base/12*months', () => {
    const r = applyIncrementMethod({ method: 'prorated_doj', basePercent: 12, monthsServed: 6 });
    expect(r.eligiblePercent).toBeCloseTo(6, 3);
  });

  it('prorated_doj caps at 12 months', () => {
    const r = applyIncrementMethod({ method: 'prorated_doj', basePercent: 12, monthsServed: 24 });
    expect(r.eligiblePercent).toBeCloseTo(12, 3);
  });

  it('custom slabs match correctly', () => {
    const slabs = [
      { from_months: 0, to_months: 3, percent_of_slab: 0 },
      { from_months: 4, to_months: 6, percent_of_slab: 50 },
      { from_months: 7, to_months: 9, percent_of_slab: 75 },
      { from_months: 10, to_months: null, percent_of_slab: 100 },
    ];
    expect(applyIncrementMethod({ method: 'custom', basePercent: 10, monthsServed: 5, customSlabs: slabs }).eligiblePercent).toBe(5);
    expect(applyIncrementMethod({ method: 'custom', basePercent: 10, monthsServed: 8, customSlabs: slabs }).eligiblePercent).toBe(7.5);
    expect(applyIncrementMethod({ method: 'custom', basePercent: 10, monthsServed: 15, customSlabs: slabs }).eligiblePercent).toBe(10);
  });

  it('custom returns 0 when no slab matches', () => {
    const r = applyIncrementMethod({ method: 'custom', basePercent: 10, monthsServed: 5, customSlabs: [] });
    expect(r.eligiblePercent).toBe(0);
  });
});
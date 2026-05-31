/**
 * Unit tests locking the Prorated-by-GDOJ behaviour.
 * Validates the same AY-bounded cutoff helper used by the edge function,
 * driven from `profiles.group_doj` instead of `doj`.
 */
import { describe, it, expect } from 'vitest';
import { monthsServedInAY } from '../../supabase/functions/compute-increment/index';

const AY_START = new Date('2025-07-01T00:00:00Z');
const AY_END = new Date('2026-06-30T00:00:00Z');
const VAL = AY_END;

describe('Prorated by GDOJ — AY-bounded month count', () => {
  it('GDOJ before AY start → counted from AY start (12 months)', () => {
    const r = monthsServedInAY(new Date('2025-01-10T00:00:00Z'), 15, AY_START, AY_END, VAL);
    expect(r.decision).toBe('pre_ay');
    expect(r.months).toBe(12);
  });

  it('GDOJ 14 Jul 2025, cutoff 15 → GDOJ month included (12 months Jul-Jun)', () => {
    const r = monthsServedInAY(new Date('2025-07-14T00:00:00Z'), 15, AY_START, AY_END, VAL);
    expect(r.decision).toBe('included');
    expect(r.months).toBe(12);
  });

  it('GDOJ 15 Jul 2025, cutoff 15 → GDOJ month excluded (11 months Aug-Jun)', () => {
    const r = monthsServedInAY(new Date('2025-07-15T00:00:00Z'), 15, AY_START, AY_END, VAL);
    expect(r.decision).toBe('excluded');
    expect(r.months).toBe(11);
  });

  it('GDOJ 16 Jul 2025, cutoff 15 → GDOJ month excluded', () => {
    const r = monthsServedInAY(new Date('2025-07-16T00:00:00Z'), 15, AY_START, AY_END, VAL);
    expect(r.decision).toBe('excluded');
    expect(r.months).toBe(11);
  });

  it('GDOJ after AY end → 0 months', () => {
    const r = monthsServedInAY(new Date('2026-07-01T00:00:00Z'), 15, AY_START, AY_END, VAL);
    expect(r.decision).toBe('after_ay');
    expect(r.months).toBe(0);
  });
});
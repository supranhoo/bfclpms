import { describe, it, expect } from 'vitest';
import {
  toRatingOutOf5,
  resolveSlabPercent,
  resolveSlab,
  validateSlabBands,
  describeSlab,
  DEFAULT_RATING_SLABS,
  type RatingSlab,
} from '@/lib/annualReview/ratingSlab';

describe('ADR-212 — final rating out of 5', () => {
  it('converts a 0..100 final score to a 5-point rating', () => {
    expect(toRatingOutOf5(85)).toBe(4.25);
    expect(toRatingOutOf5(0)).toBe(0);
    expect(toRatingOutOf5(100)).toBe(5);
    expect(toRatingOutOf5(79.6)).toBe(3.98);
  });

  it('returns null for missing / invalid scores', () => {
    expect(toRatingOutOf5(null)).toBeNull();
    expect(toRatingOutOf5(undefined)).toBeNull();
    expect(toRatingOutOf5(Number.NaN)).toBeNull();
  });
});

describe('ADR-212 — slab resolution (boundary goes to the higher slab)', () => {
  const cases: Array<[number, number]> = [
    [0, 0], [1.99, 0],
    [2, 4], [2.49, 4],
    [2.5, 6], [2.99, 6],
    [3, 8], [3.49, 8],
    [3.5, 12], [3.99, 12],
    [4, 16], [4.49, 16],
    [4.5, 20], [4.25, 16], [5, 20],
  ];
  it.each(cases)('rating %s -> %s%%', (rating, pct) => {
    expect(resolveSlabPercent(rating)).toBe(pct);
  });

  it('never returns 0% for a missing score', () => {
    expect(resolveSlabPercent(null)).toBeNull();
    expect(resolveSlabPercent(toRatingOutOf5(null))).toBeNull();
  });

  it('skips inactive bands', () => {
    const slabs: RatingSlab[] = [
      { rating_from: 0, rating_to: 4, increment_percent: 5, is_active: false },
      { rating_from: 0, rating_to: null, increment_percent: 9, is_active: true },
    ];
    expect(resolveSlabPercent(3, slabs)).toBe(9);
  });

  it('describes bands for the admin UI', () => {
    expect(describeSlab(DEFAULT_RATING_SLABS[4])).toBe('3.50 – under 4.00');
    expect(describeSlab(DEFAULT_RATING_SLABS[6])).toBe('4.50 and above');
  });

  it('resolves the slab object itself', () => {
    expect(resolveSlab(4.6)?.increment_percent).toBe(20);
  });
});

describe('ADR-212 — band validation', () => {
  it('accepts the seeded defaults', () => {
    expect(validateSlabBands(DEFAULT_RATING_SLABS).valid).toBe(true);
  });

  it('rejects overlapping bands', () => {
    const r = validateSlabBands([
      { rating_from: 0, rating_to: 3, increment_percent: 0 },
      { rating_from: 2, rating_to: null, increment_percent: 10 },
    ]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/overlap/i);
  });

  it('rejects gaps between bands', () => {
    const r = validateSlabBands([
      { rating_from: 0, rating_to: 2, increment_percent: 0 },
      { rating_from: 3, rating_to: null, increment_percent: 10 },
    ]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/gap/i);
  });

  it('requires exactly one open-ended top band', () => {
    expect(validateSlabBands([
      { rating_from: 0, rating_to: 5, increment_percent: 0 },
    ]).valid).toBe(false);
    expect(validateSlabBands([]).valid).toBe(false);
  });

  it('rejects an inverted band', () => {
    const r = validateSlabBands([
      { rating_from: 3, rating_to: 2, increment_percent: 0 },
      { rating_from: 3, rating_to: null, increment_percent: 5 },
    ]);
    expect(r.valid).toBe(false);
  });
});
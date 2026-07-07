import { describe, it, expect } from 'vitest';
import { scoreFromRaw, pickBand, type ScoringRules } from '@/lib/annualReview/systemKpiScoring';

/**
 * Covers the raw → rating → points pipeline used by the bulk data uploader
 * and the inline System Scores editor. See POLICY §AR-SYSTEM-KPI-RAW-INPUT.
 */
const higherBetter: ScoringRules = {
  direction: 'higher_better',
  bands: [
    { score: 5, threshold: 90 },
    { score: 4, threshold: 80 },
    { score: 3, threshold: 70 },
    { score: 2, threshold: 60 },
    { score: 1, threshold: 50 },
    { score: 0, threshold: 0 },
  ],
};

const lowerBetter: ScoringRules = {
  direction: 'lower_better',
  bands: [
    { score: 5, threshold: 0 },
    { score: 4, threshold: 1 },
    { score: 3, threshold: 2 },
    { score: 2, threshold: 3 },
    { score: 1, threshold: 5 },
    { score: 0, threshold: 999 },
  ],
};

describe('pickBand', () => {
  it('higher_better picks highest band whose threshold ≤ raw', () => {
    expect(pickBand(95, higherBetter)?.score).toBe(5);
    expect(pickBand(90, higherBetter)?.score).toBe(5);
    expect(pickBand(82, higherBetter)?.score).toBe(4);
    expect(pickBand(49, higherBetter)?.score).toBe(0);
  });
  it('lower_better picks highest band whose threshold ≥ raw', () => {
    expect(pickBand(0, lowerBetter)?.score).toBe(5);
    expect(pickBand(1, lowerBetter)?.score).toBe(4);
    expect(pickBand(2, lowerBetter)?.score).toBe(3);
    expect(pickBand(50, lowerBetter)?.score).toBe(0);
  });
});

describe('scoreFromRaw', () => {
  it('scales points by the per-user weight (different weights, same raw → different points)', () => {
    // User A: weight 10  → 5/5 × 10 = 10
    expect(scoreFromRaw(95, higherBetter, 10).points).toBeCloseTo(10);
    // User B: weight 20  → 5/5 × 20 = 20 (same raw, bigger weight)
    expect(scoreFromRaw(95, higherBetter, 20).points).toBeCloseTo(20);
    // User C: weight 15  → 4/5 × 15 = 12
    expect(scoreFromRaw(82, higherBetter, 15).points).toBeCloseTo(12);
  });

  it('lower-is-better direction: LTI = 0 → 5/5 × weight', () => {
    expect(scoreFromRaw(0, lowerBetter, 10).rating).toBe(5);
    expect(scoreFromRaw(0, lowerBetter, 10).points).toBeCloseTo(10);
    expect(scoreFromRaw(3, lowerBetter, 10).rating).toBe(2);
    expect(scoreFromRaw(3, lowerBetter, 10).points).toBeCloseTo(4);
  });

  it('weight = 0 → points = 0 regardless of rating', () => {
    expect(scoreFromRaw(95, higherBetter, 0).points).toBe(0);
  });

  it('missing bands → treats raw as pre-scaled points (legacy path)', () => {
    const r = scoreFromRaw(7, null, 10);
    expect(r.matched).toBe(false);
    expect(r.points).toBe(7);
  });

  it('missing bands clamps to [0, weight]', () => {
    expect(scoreFromRaw(-5, null, 10).points).toBe(0);
    expect(scoreFromRaw(50, null, 10).points).toBe(10);
  });

  it('non-numeric raw → 0 points, matched=false', () => {
    expect(scoreFromRaw(NaN, higherBetter, 10).points).toBe(0);
    expect(scoreFromRaw(NaN, higherBetter, 10).matched).toBe(false);
  });

  it('per-user weight parity contract: same raw + same bands, points scale linearly with weight', () => {
    const rawSame = 82; // rating 4
    const p10 = scoreFromRaw(rawSame, higherBetter, 10).points;
    const p25 = scoreFromRaw(rawSame, higherBetter, 25).points;
    expect(p25 / p10).toBeCloseTo(2.5);
  });
});

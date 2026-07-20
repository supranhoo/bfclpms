import { describe, it, expect } from 'vitest';
import { normaliseSystemScoreValue, normaliseSystemScoreMap } from './systemScoreNormalise';
import type { TemplateSystemScore } from '@/types/annualReview';

const slot = (weight: number, bands: Array<{ score: number; threshold: number }> = []): TemplateSystemScore =>
  ({
    id: 's', name: 's', weight,
    scoring_rules: bands.length ? { direction: 'higher_better', bands } : undefined,
  } as unknown as TemplateSystemScore);

describe('normaliseSystemScoreValue', () => {
  it('rescales rating-in-points overflow (LTI: stored=5, weight=2 → 2)', () => {
    expect(normaliseSystemScoreValue(slot(2), 5, 0)).toBe(2);
  });
  it('rescales Training (stored=5, weight=3 → 3)', () => {
    expect(normaliseSystemScoreValue(slot(3), 5, 9)).toBe(3);
  });
  it('leaves already-scaled points untouched (Production: stored=20, weight=25)', () => {
    expect(normaliseSystemScoreValue(slot(25), 20, 98)).toBe(20);
  });
  it('leaves in-range values untouched (5S: stored=2, weight=4)', () => {
    expect(normaliseSystemScoreValue(slot(4), 2, 2.33)).toBe(2);
  });
  it('clamps values above weight when weight >= 5 (no rating heuristic)', () => {
    expect(normaliseSystemScoreValue(slot(8), 100, undefined)).toBe(8);
  });
  it('uses bands + raw when both available', () => {
    // bands: score 5 @ threshold 100 (higher_better); raw=100 → rating 5 → points weight*1 = 3
    const s = slot(3, [{ score: 5, threshold: 100 }, { score: 0, threshold: 0 }]);
    expect(normaliseSystemScoreValue(s, 5, 100)).toBe(3);
  });
  it('returns 0 for missing weight', () => {
    expect(normaliseSystemScoreValue(slot(0), 5, 0)).toBe(0);
  });
});

describe('normaliseSystemScoreMap — Ujjwal 200408 regression matrix', () => {
  const slots: TemplateSystemScore[] = [
    slot(2), slot(2), slot(3), slot(4), slot(3), slot(3), slot(25), slot(8),
  ].map((s, i) => ({ ...s, id: `k${i}` } as TemplateSystemScore));
  const stored = { k0: 5, k1: 5, k2: 5, k3: 2, k4: 5, k5: 4, k6: 20, k7: 8 };
  const raw    = { k0: 0, k1: 0, k2: 21, k3: 2.33, k4: 9, k5: 35, k6: 98, k7: 100 };
  const out = normaliseSystemScoreMap(slots, stored, raw);
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  it('sums to 42.4 not 54 after normalisation', () => {
    expect(Number(sum.toFixed(2))).toBe(42.4);
  });
  it('caps every slot at its weight', () => {
    slots.forEach((s) => expect(out[s.id]).toBeLessThanOrEqual(s.weight));
  });
});
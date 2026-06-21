import { describe, it, expect } from 'vitest';
import { computeScoreComposition } from './scoringComposition';
import { computeCriteriaScore, computeOverallScore } from './scoring';
import type { AnnualReviewTemplate } from '@/types/annualReview';

const mkTemplate = (overrides: Partial<AnnualReviewTemplate['sections']> = {}): AnnualReviewTemplate => ({
  id: 't1', name: 'T', is_active: true, created_at: '', updated_at: '',
  sections: {
    system_scores: [],
    criteria: [],
    self_review_fields: [],
    eligibility_criteria: [],
    ...overrides,
  } as AnnualReviewTemplate['sections'],
} as AnnualReviewTemplate);

describe('computeScoreComposition', () => {
  it('100% system, no criteria: shows system breakdown, hides criteria', () => {
    const tpl = mkTemplate({ system_scores: [{ id: 'kra', name: 'KRA', weight: 100, source: 'carry_kra' } as any] });
    const c = computeScoreComposition(tpl, { kra: 80 }, {});
    expect(c.systemActual).toBe(80);
    expect(c.systemMax).toBe(100);
    expect(c.criteriaMax).toBe(0);
    expect(c.criteriaActual).toBe(0);
    expect(c.overallActual).toBe(80);
    expect(c.hasCriteria).toBe(false);
  });

  it('50/50 split, perfect criteria scores: overall = 100', () => {
    const tpl = mkTemplate({
      system_scores: [{ id: 'kra', name: 'KRA', weight: 50, source: 'carry_kra' } as any],
      criteria: [
        { id: 'c1', name: 'C1', weight: 5, options: [] } as any,
        { id: 'c2', name: 'C2', weight: 5, options: [] } as any,
      ],
    });
    const c = computeScoreComposition(tpl, { kra: 50 }, { c1: 5, c2: 5 });
    expect(c.systemActual).toBe(50);
    expect(c.criteriaMax).toBe(50);
    expect(c.criteriaActual).toBe(50);
    expect(c.overallActual).toBe(100);
  });

  it('partial criteria scoring: contribution is proportional', () => {
    const tpl = mkTemplate({
      system_scores: [{ id: 'kra', name: 'KRA', weight: 60, source: 'carry_kra' } as any],
      criteria: [{ id: 'c1', name: 'C1', weight: 10, options: [] } as any],
    });
    // raw 30/50 = 60% of 40 max criteria = 24
    const c = computeScoreComposition(tpl, { kra: 30 }, { c1: 3 });
    expect(c.systemActual).toBe(30);
    expect(c.criteriaMax).toBe(40);
    expect(c.criteriaActual).toBeCloseTo(24, 5);
    expect(c.overallActual).toBeCloseTo(54, 5);
  });

  it('empty template: zeros without division by zero', () => {
    const c = computeScoreComposition(mkTemplate(), {}, {});
    expect(c.overallActual).toBe(0);
    expect(c.criteriaActual).toBe(0);
    expect(c.systemActual).toBe(0);
  });

  it('overall is clamped at 100', () => {
    const tpl = mkTemplate({
      system_scores: [{ id: 's', name: 'S', weight: 80, source: 'manual' } as any],
      criteria: [{ id: 'c1', name: 'C1', weight: 10, options: [] } as any],
    });
    const c = computeScoreComposition(tpl, { s: 120 }, { c1: 5 });
    expect(c.overallActual).toBe(100);
  });

  it('parity with computeOverallScore when raw criteria already in percentage terms', () => {
    const tpl = mkTemplate({
      system_scores: [{ id: 'k', name: 'K', weight: 50, source: 'carry_kra' } as any],
      criteria: [
        { id: 'c1', name: 'C1', weight: 5, options: [] } as any,
        { id: 'c2', name: 'C2', weight: 5, options: [] } as any,
      ],
    });
    const sys = { k: 40 };
    const scores = { c1: 5, c2: 5 };
    const raw = computeCriteriaScore(tpl.sections.criteria!, scores);
    const legacy = computeOverallScore(tpl.sections.system_scores!, sys, raw);
    const comp = computeScoreComposition(tpl, sys, scores);
    // In the matched-weight case (Σ criterion.weight == criteriaMax), both
    // calculations land on the same overall.
    expect(comp.overallActual).toBeCloseTo(legacy, 5);
  });
});
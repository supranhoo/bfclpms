import { describe, it, expect } from 'vitest';
import { computeCriteriaScore, computeOverallScore } from '@/lib/annualReview/scoring';
import type { TemplateCriterion, TemplateSystemScore } from '@/types/annualReview';

const C = (id: string, weight: number): TemplateCriterion => ({
  id, name: id, weight, reviewer_stages: ['self','manager'],
});
const S = (id: string, weight: number): TemplateSystemScore => ({ id, name: id, weight });

describe('Annual Review — scoring math', () => {
  it('weights criteria correctly and caps max at weight*5', () => {
    const out = computeCriteriaScore([C('a', 10), C('b', 4)], { a: 4, b: 3 });
    expect(out.totalCriteriaScore).toBe(10 * 4 + 4 * 3);
    expect(out.maxCriteriaScore).toBe(10 * 5 + 4 * 5);
  });

  it('ignores undefined scores in the total but still accrues max', () => {
    const out = computeCriteriaScore([C('a', 10), C('b', 4)], { a: 5 });
    expect(out.totalCriteriaScore).toBe(50);
    expect(out.maxCriteriaScore).toBe(70);
  });

  it('returns zeros for empty criteria', () => {
    const out = computeCriteriaScore([], {});
    expect(out.totalCriteriaScore).toBe(0);
    expect(out.maxCriteriaScore).toBe(0);
  });

  it('overall = system + criteria_total, capped at 100', () => {
    const sys = computeOverallScore([S('safety', 20), S('hr', 10)], { safety: 18, hr: 8 }, { totalCriteriaScore: 60, maxCriteriaScore: 65 });
    expect(sys).toBe(18 + 8 + 60);
    const capped = computeOverallScore([S('safety', 50)], { safety: 50 }, { totalCriteriaScore: 80, maxCriteriaScore: 100 });
    expect(capped).toBe(100);
  });

  it('skips system scores with no value', () => {
    const out = computeOverallScore([S('a', 20), S('b', 10)], { a: 5 }, { totalCriteriaScore: 0, maxCriteriaScore: 0 });
    expect(out).toBe(5);
  });
});
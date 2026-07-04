import { describe, it, expect } from 'vitest';
import {
  computeCriteriaScore, computeOverallScore, computeCriteriaRatingOutOf5,
} from '@/lib/annualReview/scoring';
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

describe('Annual Review — /5 rating normalisation', () => {
  // test003 template shape
  const test003Criteria: TemplateCriterion[] = [
    { id: 'attendance', name: 'Attendance', weight: 15, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'] } as TemplateCriterion,
    { id: 'safety',     name: 'Safety',     weight: 20, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'] } as TemplateCriterion,
    { id: 'quality',    name: 'Quality',    weight: 20, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'] } as TemplateCriterion,
    { id: 'teamwork',   name: 'Teamwork',   weight: 20, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'] } as TemplateCriterion,
    { id: 'tools',      name: 'Tools',      weight: 10, reviewer_stages: ['self','manager','skip_manager','bu_head','hr'] } as TemplateCriterion,
  ];

  it('test003 self weighted_score 255 → rating 3.0 /5 (255 / 85)', () => {
    expect(computeCriteriaRatingOutOf5(test003Criteria, 255, 'self')).toBeCloseTo(3.0, 5);
  });

  it('returns null for null / non-finite / missing inputs', () => {
    expect(computeCriteriaRatingOutOf5(test003Criteria, null, 'self')).toBeNull();
    expect(computeCriteriaRatingOutOf5(test003Criteria, undefined, 'self')).toBeNull();
    expect(computeCriteriaRatingOutOf5(test003Criteria, Number.NaN, 'self')).toBeNull();
    expect(computeCriteriaRatingOutOf5([], 100, 'self')).toBeNull();
    expect(computeCriteriaRatingOutOf5(null, 100, 'self')).toBeNull();
  });

  it('criteria not visible to the reviewer role do not count in the denominator', () => {
    const mixed: TemplateCriterion[] = [
      { id: 'a', name: 'A', weight: 40, reviewer_stages: ['self'] } as TemplateCriterion,
      { id: 'b', name: 'B', weight: 60, reviewer_stages: ['manager'] } as TemplateCriterion,
    ];
    // Self only has criterion A (weight 40). weighted_score 40*4=160 → 160/40 = 4.0
    expect(computeCriteriaRatingOutOf5(mixed, 160, 'self')).toBeCloseTo(4.0, 5);
    // Manager only has criterion B (weight 60). weighted_score 60*3=180 → 180/60 = 3.0
    expect(computeCriteriaRatingOutOf5(mixed, 180, 'manager')).toBeCloseTo(3.0, 5);
  });

  it('rating is bounded by 5 when every criterion is rated max', () => {
    const summary = computeCriteriaScore(test003Criteria, {
      attendance: 5, safety: 5, quality: 5, teamwork: 5, tools: 5,
    });
    expect(computeCriteriaRatingOutOf5(test003Criteria, summary.totalCriteriaScore, 'self'))
      .toBeCloseTo(5.0, 5);
  });
});
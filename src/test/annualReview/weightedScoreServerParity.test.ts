import { describe, it, expect } from 'vitest';
import { computeCriteriaScore } from '@/lib/annualReview/scoring';
import type { TemplateCriterion } from '@/types/annualReview';

/**
 * Parity contract test — the PL/pgSQL function
 * `public.compute_annual_review_weighted_score(instance_id, reviewer_role)`
 * MUST return exactly `computeCriteriaScore(criteria, criteria_scores).totalCriteriaScore`
 * for the same inputs, with the same reviewer_stages filter. This test locks
 * the reference math on the TS side so a future refactor cannot drift from
 * the SQL implementation without breaking a test.
 *
 * See POLICY §AR-WEIGHTED-SCORE-SSOT.
 */
describe('weighted_score server/client parity (SSOT contract)', () => {
  const criteria: TemplateCriterion[] = [
    { id: 'attendance', name: 'Attendance', weight: 15, options: [], reviewer_stages: ['self', 'manager'] } as unknown as TemplateCriterion,
    { id: 'safety',     name: 'Safety',     weight: 20, options: [], reviewer_stages: ['self', 'manager'] } as unknown as TemplateCriterion,
    { id: 'quality',    name: 'Quality',    weight: 20, options: [], reviewer_stages: ['self', 'manager'] } as unknown as TemplateCriterion,
    { id: 'teamwork',   name: 'Teamwork',   weight: 20, options: [], reviewer_stages: ['self', 'manager'] } as unknown as TemplateCriterion,
    { id: 'tools',      name: 'Tools',      weight: 10, options: [], reviewer_stages: ['self', 'manager'] } as unknown as TemplateCriterion,
  ];

  it('matches the test003 backfill: 15*5 + 20*5 + 20*4 = 255 (teamwork/tools unscored)', () => {
    const scores = { attendance: 5, safety: 5, quality: 4 };
    expect(computeCriteriaScore(criteria, scores).totalCriteriaScore).toBe(255);
  });

  it('unknown criterion ids in criteria_scores are ignored (drop, do not throw)', () => {
    const scores = { attendance: 5, crit_stale: 4 } as Record<string, number>;
    expect(computeCriteriaScore(criteria, scores).totalCriteriaScore).toBe(75);
  });

  it('empty criteria_scores yields 0 (never null)', () => {
    expect(computeCriteriaScore(criteria, {}).totalCriteriaScore).toBe(0);
  });
});
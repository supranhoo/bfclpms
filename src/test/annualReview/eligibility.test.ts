import { describe, it, expect } from 'vitest';
import { evaluate, evaluateEligibility } from '@/lib/annualReview/eligibility';
import type { EligibilityCriterion } from '@/types/annualReview';

describe('Annual Review — eligibility evaluator', () => {
  it('evaluates each operator', () => {
    expect(evaluate('equals', 5, 5)).toBe(true);
    expect(evaluate('not_equals', 5, 4)).toBe(true);
    expect(evaluate('gt', 91, 90)).toBe(true);
    expect(evaluate('gte', 90, 90)).toBe(true);
    expect(evaluate('lt', 1, 2)).toBe(true);
    expect(evaluate('lte', 2, 2)).toBe(true);
    expect(evaluate('gt', 89, 90)).toBe(false);
  });

  it('returns false when actual is missing', () => {
    expect(evaluate('gte', undefined, 90)).toBe(false);
    expect(evaluate('gte', null, 90)).toBe(false);
  });

  it('flags failures with the criterion attached', () => {
    const criteria: EligibilityCriterion[] = [
      { id: 'att',   name: 'Attendance',  type: 'number',  operator: 'gte', expected_value: 90 },
      { id: 'disc',  name: 'Disciplinary case', type: 'boolean', operator: 'equals', expected_value: false },
    ];
    const result = evaluateEligibility(criteria, { att: 87, disc: false });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].criterion.id).toBe('att');
  });

  it('passes when every criterion is satisfied', () => {
    const r = evaluateEligibility(
      [{ id: 'att', name: 'a', type: 'number', operator: 'gte', expected_value: 90 }],
      { att: 95 },
    );
    expect(r.passed).toBe(true);
  });
});
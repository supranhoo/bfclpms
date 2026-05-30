import { describe, it, expect } from 'vitest';
import {
  evaluateIncrementEligibility,
  type EligibilityCriterion,
} from './incrementEligibility';

function c(over: Partial<EligibilityCriterion> = {}): EligibilityCriterion {
  return {
    id: over.id ?? 'c1',
    criterion_key: 'absent_days',
    criterion_name: 'Absent Days',
    comparison_operator: '>=',
    threshold_value: 10,
    unit_label: 'days',
    is_active: true,
    effective_date: '2025-04-01',
    ...over,
  };
}

describe('evaluateIncrementEligibility', () => {
  it('spec example: Employee A breaches, B passes', () => {
    const crit = [c()];
    const a = evaluateIncrementEligibility({ absent_days: 12 }, crit);
    const b = evaluateIncrementEligibility({ absent_days: 8 }, crit);
    expect(a.eligible).toBe(false);
    expect(a.failed[0].criterion_name).toBe('Absent Days');
    expect(b.eligible).toBe(true);
  });

  it('operator matrix at boundary', () => {
    expect(evaluateIncrementEligibility({ absent_days: 10 }, [c({ comparison_operator: '>=' })]).eligible).toBe(false);
    expect(evaluateIncrementEligibility({ absent_days: 10 }, [c({ comparison_operator: '>' })]).eligible).toBe(true);
    expect(evaluateIncrementEligibility({ absent_days: 10 }, [c({ comparison_operator: '<=' })]).eligible).toBe(false);
    expect(evaluateIncrementEligibility({ absent_days: 10 }, [c({ comparison_operator: '<' })]).eligible).toBe(true);
    expect(evaluateIncrementEligibility({ absent_days: 10 }, [c({ comparison_operator: '=' })]).eligible).toBe(false);
    expect(evaluateIncrementEligibility({ absent_days: 11 }, [c({ comparison_operator: '=' })]).eligible).toBe(true);
  });

  it('inactive criteria are skipped', () => {
    const r = evaluateIncrementEligibility({ absent_days: 100 }, [c({ is_active: false })]);
    expect(r.eligible).toBe(true);
  });

  it('future-dated criteria are skipped', () => {
    const r = evaluateIncrementEligibility(
      { absent_days: 100 },
      [c({ effective_date: '2999-01-01' })],
      new Date('2026-05-30'),
    );
    expect(r.eligible).toBe(true);
  });

  it('missing metric for a criterion is skipped (not auto-fail)', () => {
    const r = evaluateIncrementEligibility({}, [c()]);
    expect(r.eligible).toBe(true);
  });

  it('aggregates multiple failures', () => {
    const r = evaluateIncrementEligibility(
      { absent_days: 12, lwp_days: 8 },
      [
        c({ id: 'a', criterion_key: 'absent_days', threshold_value: 10 }),
        c({ id: 'b', criterion_key: 'lwp_days', criterion_name: 'LWP', threshold_value: 5 }),
      ],
    );
    expect(r.eligible).toBe(false);
    expect(r.failed).toHaveLength(2);
  });

  it('empty criteria → eligible', () => {
    const r = evaluateIncrementEligibility({ absent_days: 999 }, []);
    expect(r.eligible).toBe(true);
    expect(r.failed).toEqual([]);
  });

  it('custom criterion key honored', () => {
    const r = evaluateIncrementEligibility(
      { safety_violations: 3 },
      [c({ id: 'x', criterion_key: 'safety_violations', criterion_name: 'Safety', threshold_value: 2 })],
    );
    expect(r.eligible).toBe(false);
    expect(r.failed[0].criterion_name).toBe('Safety');
  });
});
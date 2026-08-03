import { describe, expect, it } from 'vitest';
import { matchesBulkRule, exemptableCriteria } from '@/services/annualReview/bulkExemption';
import { applyExemptionPenalty, DEFAULT_RATING_SLABS } from '@/lib/annualReview/ratingSlab';
import type { EffectiveEligibility, ExemptionPolicyRow } from '@/lib/annualReview/effectiveEligibility';

const criterion = (id: string, name: string, type: 'number' | 'boolean' = 'number') => ({
  id, name, type, operator: 'lte' as const, expected_value: '0',
});

function elig(blocking: Array<{ id: string; name: string; actual: unknown; exemptable?: boolean }>): EffectiveEligibility {
  const failures = blocking.map((b) => ({
    criterion: criterion(b.id, b.name),
    actual: b.actual,
    exemptable: b.exemptable ?? true,
    waived: false,
  }));
  return { status: 'ineligible', missing: [], failures, waived: [], blocking: failures, hasPendingExemption: false };
}

describe('ADR-224 bulk exemption matching', () => {
  it('matches when the failing value is within the threshold', () => {
    const r = matchesBulkRule({
      eligibility: elig([{ id: 'abs', name: 'Absent Days', actual: 8 }]),
      criterionId: 'abs', operator: 'lte', threshold: '10', onlySoleFailure: true,
    });
    expect(r.matched).toBe(true);
    expect(r.otherFailures).toBe(0);
  });

  it('does not match when the value exceeds the threshold', () => {
    const r = matchesBulkRule({
      eligibility: elig([{ id: 'abs', name: 'Absent Days', actual: 14 }]),
      criterionId: 'abs', operator: 'lte', threshold: '10', onlySoleFailure: true,
    });
    expect(r.matched).toBe(false);
  });

  it('skips employees blocked by other criteria when sole-failure is on', () => {
    const e = elig([
      { id: 'abs', name: 'Absent Days', actual: 5 },
      { id: 'lwp', name: 'LWP Days', actual: 3 },
    ]);
    expect(matchesBulkRule({ eligibility: e, criterionId: 'abs', operator: 'lte', threshold: '10', onlySoleFailure: true }).matched).toBe(false);
    expect(matchesBulkRule({ eligibility: e, criterionId: 'abs', operator: 'lte', threshold: '10', onlySoleFailure: false }).matched).toBe(true);
  });

  it('never matches a non-exemptable criterion', () => {
    const r = matchesBulkRule({
      eligibility: elig([{ id: 'disc', name: 'Disciplinary Action', actual: 1, exemptable: false }]),
      criterionId: 'disc', operator: 'lte', threshold: '10', onlySoleFailure: true,
    });
    expect(r.matched).toBe(false);
  });

  it('lists only exemptable criteria from the template maps', () => {
    const policy: ExemptionPolicyRow[] = [
      { question_key: 'absent days', is_exemptable: true } as ExemptionPolicyRow,
      { question_key: 'disciplinary', is_exemptable: false } as ExemptionPolicyRow,
    ];
    const out = exemptableCriteria(
      { t1: [criterion('abs', 'Absent Days'), criterion('disc', 'Disciplinary Action')] as never },
      policy,
    );
    expect(out.map((c) => c.id)).toEqual(['abs']);
  });
});

describe('ADR-224 exemption penalty rule', () => {
  it('steps an employee down N slabs', () => {
    const res = applyExemptionPenalty(20, DEFAULT_RATING_SLABS, { mode: 'step_down', stepDownSlabs: 1, scope: 'all_slabs', floorPercent: 0 });
    expect(res.applied).toBe(true);
    expect(res.to).toBeLessThan(20);
  });

  it('never drops below the configured floor', () => {
    const res = applyExemptionPenalty(6, DEFAULT_RATING_SLABS, { mode: 'step_down', stepDownSlabs: 5, scope: 'all_slabs', floorPercent: 4 });
    expect(res.to).toBeGreaterThanOrEqual(4);
  });

  it('leaves the percentage untouched when the rule is none', () => {
    const res = applyExemptionPenalty(12, DEFAULT_RATING_SLABS, { mode: 'none' });
    expect(res.applied).toBe(false);
    expect(res.percent).toBe(12);
  });
});
import { describe, it, expect } from 'vitest';
import {
  effectiveSlabPercent, eligibilitySummary, isExemptable, resolveEligibility,
  type ExemptionPolicyRow, type ExemptionRecord,
} from '@/lib/annualReview/effectiveEligibility';
import type { EligibilityCriterion } from '@/types/annualReview';

const absent: EligibilityCriterion = { id: 'absent', name: 'Absent Days', type: 'number', operator: 'lte', expected_value: 5 };
const disc: EligibilityCriterion = { id: 'disc', name: 'Disciplinary Action', type: 'boolean', operator: 'equals', expected_value: false };
const tenure: EligibilityCriterion = { id: 'ten', name: '6 Month Completion', type: 'number', operator: 'gte', expected_value: 6 };

const policy: ExemptionPolicyRow[] = [
  { question_key: 'absent', label: 'Absent Days', is_exemptable: true },
  { question_key: 'lwp', label: 'LWP Days', is_exemptable: true },
  { question_key: 'disciplinary', label: 'Disciplinary', is_exemptable: false },
  { question_key: 'month completion', label: 'Month Completion', is_exemptable: false },
];

const approved = (criterion_id: string): ExemptionRecord => ({
  instance_id: 'i1', criterion_id, criterion_name: criterion_id, status: 'approved', reason: 'ok',
});

describe('ADR-221 effective eligibility', () => {
  it('absent days is exemptable, disciplinary and tenure are not', () => {
    expect(isExemptable('Absent Days', policy)).toBe(true);
    expect(isExemptable('LWP Days', policy)).toBe(true);
    expect(isExemptable('Disciplinary Action', policy)).toBe(false);
    expect(isExemptable('6 Month Completion', policy)).toBe(false);
    expect(isExemptable('Something Else', policy)).toBe(false);
  });

  it('no criteria → unknown', () => {
    expect(resolveEligibility({ criteria: [], inputs: {} }).status).toBe('unknown');
  });

  it('all criteria pass → eligible', () => {
    const r = resolveEligibility({ criteria: [absent, disc, tenure], inputs: { absent: 2, disc: false, ten: 12 }, policy });
    expect(r.status).toBe('eligible');
    expect(r.failures).toHaveLength(0);
  });

  it('failing absent days without exemption → ineligible', () => {
    const r = resolveEligibility({ criteria: [absent], inputs: { absent: 9 }, policy });
    expect(r.status).toBe('ineligible');
    expect(eligibilitySummary(r)).toBe('Ineligible (Absent Days)');
  });

  it('approved exemption on absent days → exempted (eligible)', () => {
    const r = resolveEligibility({ criteria: [absent], inputs: { absent: 9 }, exemptions: [approved('absent')], policy });
    expect(r.status).toBe('exempted');
    expect(r.waived).toHaveLength(1);
  });

  it('approved exemption cannot waive disciplinary action or tenure', () => {
    const r = resolveEligibility({
      criteria: [disc, tenure],
      inputs: { disc: true, ten: 3 },
      exemptions: [approved('disc'), approved('ten')],
      policy,
    });
    expect(r.status).toBe('ineligible');
    expect(r.blocking).toHaveLength(2);
  });

  it('pending exemption keeps the employee ineligible but is flagged', () => {
    const r = resolveEligibility({
      criteria: [absent],
      inputs: { absent: 9 },
      exemptions: [{ ...approved('absent'), status: 'pending' }],
      policy,
    });
    expect(r.status).toBe('ineligible');
    expect(r.hasPendingExemption).toBe(true);
  });

  it('missing answer counts as a failure', () => {
    const r = resolveEligibility({ criteria: [tenure], inputs: {}, policy });
    expect(r.status).toBe('ineligible');
  });

  it('ineligible employees show a 0% slab', () => {
    expect(effectiveSlabPercent(12, 'ineligible')).toBe(0);
    expect(effectiveSlabPercent(12, 'exempted')).toBe(12);
    expect(effectiveSlabPercent(12, 'eligible')).toBe(12);
    expect(effectiveSlabPercent(null, 'unknown')).toBeNull();
  });
});
import { describe, it, expect } from 'vitest';
import { evaluateEligibility } from '@/lib/annualReview/eligibility';
import type { EligibilityCriterion } from '@/types/annualReview';

/**
 * §AR-ELIGIBILITY-REMARK — the HR-input editor blocks save when at least one
 * criterion fails AND the remark is empty/whitespace. The gate is derived from
 * `evaluateEligibility(criteria, values).passed`. These cases lock that
 * derivation so a regression in `evaluateEligibility` immediately fails here.
 */
const criteria: EligibilityCriterion[] = [
  { id: 'abs',  name: 'Absent Days',         type: 'number',  operator: 'lt',     expected_value: 1,     description: 'Absent days in FY must be less than 1' },
  { id: 'disc', name: 'Disciplinary Actions',type: 'boolean', operator: 'equals', expected_value: false, description: 'No disciplinary action on record' },
];

function remarkRequired(values: Record<string, unknown>): boolean {
  return !evaluateEligibility(criteria, values).passed;
}

function canSave(values: Record<string, unknown>, remark: string): boolean {
  if (remarkRequired(values) && !remark.trim()) return false;
  return true;
}

describe('Annual Review — eligibility remark gating', () => {
  it('allows save when all criteria pass and remark is empty (remark optional)', () => {
    const values = { abs: 0, disc: false };
    expect(remarkRequired(values)).toBe(false);
    expect(canSave(values, '')).toBe(true);
  });

  it('blocks save when a criterion fails and remark is empty / whitespace', () => {
    const values = { abs: 5, disc: false }; // 5 < 1 is false → failure
    expect(remarkRequired(values)).toBe(true);
    expect(canSave(values, '')).toBe(false);
    expect(canSave(values, '   ')).toBe(false);
  });

  it('allows save when a criterion fails but the submitter provides a remark', () => {
    const values = { abs: 5, disc: false };
    expect(canSave(values, 'Employee on approved sabbatical — eligible per HR policy 4.2')).toBe(true);
  });

  it('re-arms the requirement when inputs flip back into a failing state', () => {
    expect(remarkRequired({ abs: 0, disc: false })).toBe(false);
    expect(remarkRequired({ abs: 0, disc: true  })).toBe(true);  // disc must equal false
  });
});
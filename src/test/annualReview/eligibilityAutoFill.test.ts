import { describe, expect, it } from 'vitest';
import { deriveAutoInputs, mergeInputs, monthsBetween } from '@/lib/annualReview/eligibilityAutoFill';
import type { EligibilityCriterion } from '@/types/annualReview';

const tenureCrit: EligibilityCriterion = {
  id: 'tenure',
  name: '6 Month Completion as on 30 Jun 2026',
  description: '',
  type: 'number',
  operator: 'gte',
  expected_value: 6,
};

const nonTenure: EligibilityCriterion = {
  id: 'absent',
  name: 'Absent Days',
  description: '',
  type: 'number',
  operator: 'lt',
  expected_value: 1,
};

describe('eligibilityAutoFill', () => {
  it('monthsBetween counts whole calendar months', () => {
    expect(monthsBetween('2026-01-01', '2026-06-30')).toBe(5);
    expect(monthsBetween('2025-06-01', '2026-06-30')).toBe(13);
    expect(monthsBetween('2026-07-01', '2026-06-30')).toBe(0);
  });

  it('auto-fills tenure criterion from DOJ against 30-Jun of review year', () => {
    const out = deriveAutoInputs([tenureCrit, nonTenure], '2026-01-01', 2026);
    expect(out.tenure).toBe(5);
    expect(out.absent).toBeUndefined();
  });

  it('returns empty when DOJ missing', () => {
    expect(deriveAutoInputs([tenureCrit], null, 2026)).toEqual({});
  });

  it('mergeInputs — manual value wins over auto', () => {
    const merged = mergeInputs({ tenure: 12 }, { tenure: 5 });
    expect(merged.tenure).toBe(12);
  });

  it('mergeInputs — empty/null manual falls back to auto', () => {
    const merged = mergeInputs({ tenure: '' }, { tenure: 5 });
    expect(merged.tenure).toBe(5);
  });
});
import { describe, it, expect } from 'vitest';
import { validateExemptionPolicy } from '@/lib/annualReview/effectiveEligibility';

describe('ADR-223 — exemption rule validation', () => {
  it('accepts a clean rule set', () => {
    expect(validateExemptionPolicy([
      { question_key: 'absent', label: 'Absent Days' },
      { question_key: 'lwp', label: 'LWP' },
    ]).valid).toBe(true);
  });

  it('rejects an empty label', () => {
    const r = validateExemptionPolicy([{ question_key: 'absent', label: '  ' }]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/label is required/i);
  });

  it('rejects an empty match key', () => {
    const r = validateExemptionPolicy([{ question_key: '', label: 'Absent' }]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/match key is required/i);
  });

  it('rejects a non-normalised match key', () => {
    const r = validateExemptionPolicy([{ question_key: 'Absent  Days', label: 'Absent Days' }]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/lower-case/i);
  });

  it('rejects duplicate match keys', () => {
    const r = validateExemptionPolicy([
      { question_key: 'absent', label: 'Absent Days' },
      { question_key: 'absent', label: 'Absenteeism' },
    ]);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate/i);
  });
});
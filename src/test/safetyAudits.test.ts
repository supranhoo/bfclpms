import { describe, it, expect } from 'vitest';
import {
  SAFETY_AUDIT_RUN_STATUSES,
  SAFETY_AUDIT_ANSWERS,
  computeAuditScore,
  countCriticalFailures,
  validateAuditSubmission,
  complianceBand,
  type ScoringPair,
} from '@/lib/safetyAudits';

const mk = (
  weight: number,
  is_critical: boolean,
  answer: 'yes' | 'no' | 'na',
  evidence_required = false,
  evidence_path: string | null = null,
): ScoringPair => ({
  item: { weight, is_critical, evidence_required },
  response: { answer, evidence_path },
});

describe('safetyAudits enums', () => {
  it('matches DB run statuses', () => {
    expect([...SAFETY_AUDIT_RUN_STATUSES]).toEqual(['draft', 'submitted', 'reviewed']);
  });
  it('matches DB answer enum', () => {
    expect([...SAFETY_AUDIT_ANSWERS]).toEqual(['yes', 'no', 'na']);
  });
});

describe('computeAuditScore', () => {
  it('returns 0 when nothing scored', () => {
    expect(computeAuditScore([])).toBe(0);
    expect(computeAuditScore([mk(1, false, 'na')])).toBe(0);
  });
  it('weights yes vs no', () => {
    expect(computeAuditScore([mk(2, false, 'yes'), mk(1, false, 'no')])).toBeCloseTo(66.67, 2);
  });
  it('excludes NA from numerator and denominator', () => {
    expect(
      computeAuditScore([mk(1, false, 'yes'), mk(99, false, 'na')]),
    ).toBe(100);
  });
});

describe('countCriticalFailures', () => {
  it('counts only critical NOs', () => {
    expect(countCriticalFailures([
      mk(1, true, 'no'),
      mk(1, true, 'yes'),
      mk(1, false, 'no'),
      mk(1, true, 'na'),
    ])).toBe(1);
  });
});

describe('validateAuditSubmission', () => {
  it('rejects empty', () => {
    expect(validateAuditSubmission([])).toMatch(/items/i);
  });
  it('requires evidence on No when item demands it', () => {
    expect(
      validateAuditSubmission([mk(1, true, 'no', true, '')]),
    ).toMatch(/evidence/i);
  });
  it('passes when evidence supplied', () => {
    expect(
      validateAuditSubmission([mk(1, true, 'no', true, 'https://x/y.jpg')]),
    ).toBeNull();
  });
  it('does not require evidence on Yes', () => {
    expect(
      validateAuditSubmission([mk(1, true, 'yes', true, '')]),
    ).toBeNull();
  });
});

describe('complianceBand', () => {
  it('maps thresholds', () => {
    expect(complianceBand(95)).toBe('excellent');
    expect(complianceBand(80)).toBe('good');
    expect(complianceBand(65)).toBe('fair');
    expect(complianceBand(40)).toBe('poor');
    expect(complianceBand(null)).toBe('poor');
  });
});
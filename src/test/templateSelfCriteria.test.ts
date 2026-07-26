import { describe, it, expect } from 'vitest';
import {
  templateHasSelfCriteria,
  emptyCriteriaScoresIsExpected,
} from '@/lib/annualReview/templateSelfCriteria';

// Mock: narrative-only template (real shape of a6e88cd5… — 100600 Umesh)
const narrativeOnly = {
  criteria: [],
  self_review_fields: [{ id: 'f_1l8xkf7' }, { id: 'f_39z22je' }],
  system_scores: [{ id: 'sys_bgd6797', source: 'carry_kra', weight: 100 }],
};

// Mock: criteria-bearing template
const withCriteria = {
  criteria: [{ id: 'c1', name: 'Attendance', weight: 50 }],
  self_review_fields: [],
  system_scores: [],
};

describe('templateHasSelfCriteria', () => {
  it('narrative-only template has no self criteria', () => {
    expect(templateHasSelfCriteria(narrativeOnly)).toBe(false);
    expect(emptyCriteriaScoresIsExpected(narrativeOnly)).toBe(true);
  });

  it('criteria-bearing template has self criteria', () => {
    expect(templateHasSelfCriteria(withCriteria)).toBe(true);
    expect(emptyCriteriaScoresIsExpected(withCriteria)).toBe(false);
  });

  it('missing / malformed sections are treated as narrative-only (no rescore repair)', () => {
    expect(templateHasSelfCriteria(null)).toBe(false);
    expect(templateHasSelfCriteria(undefined)).toBe(false);
    expect(templateHasSelfCriteria({ criteria: 'nope' as unknown })).toBe(false);
    expect(emptyCriteriaScoresIsExpected({})).toBe(true);
  });
});
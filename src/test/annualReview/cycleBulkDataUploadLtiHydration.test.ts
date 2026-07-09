import { describe, it, expect } from 'vitest';
import { scoreFromRaw, type ScoringRules } from '@/lib/annualReview/systemKpiScoring';

/**
 * Regression lock: bulk-data upload for lower-is-better System KPIs
 * (e.g. Lost Time Injury Rate) inverted the score whenever the template
 * slot lacked `scoring_rules`, because `scoreFromRaw` fell into the legacy
 * "raw = pre-scaled points" branch. After hydration from the KPI Library,
 * LTI = 0 must yield 5/5 and LTI = 3 must yield 2/5. This test locks the
 * arithmetic contract that `hydrateSystemScoringRules` restores.
 *
 * See src/services/annualReview/cycleBulkDataUpload.ts (hydrateSystemScoringRules)
 * and POLICY §AR-SYSTEM-KPI-RAW-INPUT.
 */

const ltiRules: ScoringRules = {
  direction: 'lower_better',
  bands: [
    { score: 5, threshold: 0 },
    { score: 4, threshold: 1 },
    { score: 3, threshold: 2 },
    { score: 2, threshold: 3 },
    { score: 1, threshold: 4 },
    { score: 0, threshold: 999 }, // >4 sentinel
  ],
};

describe('LTI bulk upload — hydrated vs legacy scoring', () => {
  const weight = 3;

  it('legacy path (no rules) INVERTS lower_better: reproduces the reported bug', () => {
    // This is the pre-fix behavior we must never ship again for hydrated slots.
    const lti0 = scoreFromRaw(0, null, weight);
    const lti3 = scoreFromRaw(3, null, weight);
    expect(lti0.points).toBe(0);        // wrong: 0 LTI should be best
    expect(lti3.points).toBe(3);        // wrong: 3 LTIs should be near-worst
    expect(lti0.matched).toBe(false);
    expect(lti3.matched).toBe(false);
  });

  it('hydrated rules restore correct semantics for LTI = 0 (best)', () => {
    const r = scoreFromRaw(0, ltiRules, weight);
    expect(r.rating).toBe(5);
    expect(r.points).toBe(3);
    expect(r.matched).toBe(true);
  });

  it('hydrated rules restore correct semantics for LTI = 3 (poor)', () => {
    const r = scoreFromRaw(3, ltiRules, weight);
    expect(r.rating).toBe(2);
    expect(r.points).toBeCloseTo(1.2, 5);
    expect(r.matched).toBe(true);
  });

  it('hydrated rules score LTI = 1 as rating 4', () => {
    const r = scoreFromRaw(1, ltiRules, weight);
    expect(r.rating).toBe(4);
    expect(r.points).toBeCloseTo(2.4, 5);
  });
});
import { describe, it, expect, vi } from 'vitest';
import type { AnnualReviewTemplate } from '@/types/annualReview';
import type { ScoringRules } from '@/lib/annualReview/systemKpiScoring';

/**
 * v2.66.97 — regression lock for the iterator-exhaustion bug in
 * `hydrateSystemScoringRules`. Before the fix, calling `Array.from(templates)`
 * exhausted the passed-in `MapIterator` and the subsequent `for (const t of
 * templates)` loop saw nothing, so `need` stayed empty and no slot ever got
 * its `scoring_rules` hydrated from the KPI Library — while the health strip
 * falsely reported "all linked".
 */

const LTI_RULES: ScoringRules = {
  direction: 'lower_better',
  bands: [
    { score: 5, threshold: 0 }, { score: 4, threshold: 1 },
    { score: 3, threshold: 2 }, { score: 2, threshold: 3 },
    { score: 1, threshold: 4 }, { score: 0, threshold: 5 },
  ],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (_table: string) => ({
      select: (_cols: string) => Promise.resolve({
        data: [
          { key: 'lti', name_en: 'Lost Time Injury (LTI) Rate', scoring_rules: LTI_RULES, uom_type: 'number' },
        ],
        error: null,
      }),
    }),
  },
}));

import { __hydrateSystemScoringRulesForTests, __resolveScoringRulesForTests } from '@/services/annualReview/cycleBulkDataUpload';

function makeTemplate(name: string, slotName: string, libraryKey?: string): AnnualReviewTemplate {
  return {
    id: `tpl-${name}`,
    name,
    sections: {
      system_scores: [
        {
          id: 's-lti',
          name: slotName,
          weight: 3,
          source: 'system',
          scoring_rules: null,
          library_key: libraryKey,
        } as never,
      ],
      eligibility_criteria: [],
    } as never,
  } as unknown as AnnualReviewTemplate;
}

describe('hydrateSystemScoringRules — iterator exhaustion regression (v2.66.97)', () => {
  it('mutates slot.scoring_rules in place when the library has the row (pure helper)', () => {
    const tpl = makeTemplate('DRI-W-Mech', 'Lost Time Injury (LTI) Rate', 'lti');
    const unresolved = __resolveScoringRulesForTests([tpl], [
      { key: 'lti', name_en: 'Lost Time Injury (LTI) Rate', scoring_rules: LTI_RULES, uom_type: 'number' },
    ]);
    expect(unresolved).toEqual([]);
    expect(tpl.sections.system_scores[0].scoring_rules?.bands?.length).toBe(6);
  });

  it('reports unresolved slot when the library has no match (pure helper)', () => {
    const tpl = makeTemplate('DRI-W-Mech', 'Something Nobody Mapped');
    const unresolved = __resolveScoringRulesForTests([tpl], []);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].name).toBe('Something Nobody Mapped');
    expect(unresolved[0].templateNames).toEqual(['DRI-W-Mech']);
  });

  it('hydrates slots when called with a Map.values() iterator (bug-lock)', async () => {
    const tpl = makeTemplate('DRI-W-Mech', 'Lost Time Injury (LTI) Rate', 'lti');
    const byId = new Map<string, AnnualReviewTemplate>([[tpl.id, tpl]]);
    // Passing `.values()` — a single-use MapIterator, exactly as production does.
    const unresolved = await __hydrateSystemScoringRulesForTests(byId.values());
    expect(unresolved).toEqual([]);
    // The pre-fix code returned early → this would be null/empty.
    expect(tpl.sections.system_scores[0].scoring_rules?.bands?.length).toBe(6);
  });
});
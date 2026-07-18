import { describe, it, expect } from 'vitest';
import { missingRawSystemScoreItems } from '@/lib/annualReview/systemScoresStatus';

const tpl = (items: any[]) =>
  ({ sections: { system_scores: items } } as any);

describe('missingRawSystemScoreItems (ADR-116)', () => {
  it('returns empty when template has no system scores', () => {
    expect(missingRawSystemScoreItems(tpl([]), {}, {})).toEqual([]);
  });

  it('flags safety/hr/env/manual items with no raw and no scaled value', () => {
    const t = tpl([
      { id: 'a', name: '5S', source: 'safety' },
      { id: 'b', name: 'Training', source: 'hr' },
    ]);
    const out = missingRawSystemScoreItems(t, {}, {});
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('ignores carry_kra items entirely', () => {
    const t = tpl([{ id: 'k', name: 'KRA', source: 'carry_kra' }]);
    expect(missingRawSystemScoreItems(t, {}, {})).toEqual([]);
  });

  it('treats scaled value as sufficient (legacy upload path)', () => {
    const t = tpl([{ id: 'a', name: '5S', source: 'safety' }]);
    expect(missingRawSystemScoreItems(t, {}, { a: 4 })).toEqual([]);
  });

  it('treats raw value as sufficient (0 counts as scored)', () => {
    const t = tpl([{ id: 'a', name: 'LTI', source: 'safety' }]);
    expect(missingRawSystemScoreItems(t, { a: 0 }, {})).toEqual([]);
  });
});
/** ADR-218j — the reserved recommendation key is never a criterion row. */
import { describe, expect, it } from 'vitest';
import {
  buildStageBlocks,
  buildStageMatrix,
  OVERALL_RECOMMENDATION_KEY,
  type ReviewFormResponseRow,
} from './reviewFormView';

const template = {
  sections: {
    criteria: [
      { id: 'c1', name: 'Attendance & Punctuality', weight: 10, reviewer_stages: ['self', 'bu_head'] },
    ],
    self_review_fields: [{ id: 'f1', label: 'What new skill?' }],
  },
} as any;

const responses: ReviewFormResponseRow[] = [
  {
    reviewer_role: 'self',
    criteria_scores: { c1: 5 },
    qualitative_responses: { f1: 'excel' },
    weighted_score: 325,
    submitted_at: '2026-07-20T00:00:00Z',
    notes: null,
  } as any,
  {
    reviewer_role: 'bu_head',
    criteria_scores: { c1: 5 },
    qualitative_responses: {
      [OVERALL_RECOMMENDATION_KEY]: '  I recommend him for promotion and salary revision.  ',
      c1: 'consistent',
    },
    weighted_score: 310,
    submitted_at: '2026-07-25T00:00:00Z',
    notes: null,
  } as any,
];

describe('buildStageMatrix / buildStageBlocks', () => {
  it('never renders the reserved recommendation key as a criterion row', () => {
    const { rows } = buildStageMatrix({ template, responses });
    expect(rows.map((r) => r.id)).not.toContain(OVERALL_RECOMMENDATION_KEY);
    expect(rows.map((r) => r.id)).toEqual(['c1']);
  });

  it('exposes the trimmed recommendation on the owning stage only', () => {
    const blocks = buildStageBlocks({ template, responses });
    const self = blocks.find((b) => b.role === 'self')!;
    const bu = blocks.find((b) => b.role === 'bu_head')!;
    expect(self.recommendation).toBeNull();
    expect(bu.recommendation).toBe('I recommend him for promotion and salary revision.');
  });

  it('still excludes self-review field answers from criteria', () => {
    const blocks = buildStageBlocks({ template, responses });
    const self = blocks.find((b) => b.role === 'self')!;
    expect(self.criteria.map((c) => c.id)).toEqual(['c1']);
  });

  it('returns null recommendation when the key is blank', () => {
    const blocks = buildStageBlocks({
      template,
      responses: [
        { ...(responses[1] as any), qualitative_responses: { [OVERALL_RECOMMENDATION_KEY]: '   ' } },
      ],
    });
    expect(blocks[0].recommendation).toBeNull();
  });
});

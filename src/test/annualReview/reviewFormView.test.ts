import { describe, it, expect } from 'vitest';
import { buildStageBlocks, buildStageMatrix, buildSystemScoreRows, criterionNameMap } from '@/lib/annualReview/reviewFormView';

const template = {
  sections: {
    criteria: [
      { id: 'c1', name: 'Quality', weight: 10 },
      { id: 'c2', name: 'Safety', weight: 5 },
    ],
    self_review_fields: [{ id: 'f1', label: 'Achievements' }],
    system_scores: [{ id: 's1', label: 'Production', weight: 20, source: 'carry_kra' }],
  },
} as never;

describe('reviewFormView', () => {
  it('maps criterion ids to names', () => {
    expect(criterionNameMap(template)).toEqual({ c1: 'Quality', c2: 'Safety' });
  });

  it('builds ordered stage blocks and excludes self-review field answers', () => {
    const blocks = buildStageBlocks({
      template,
      enabledStages: ['self', 'manager', 'dept_head'] as never,
      responses: [
        {
          reviewer_role: 'dept_head' as never,
          criteria_scores: { c1: 4 },
          qualitative_responses: { c1: 'good' },
          weighted_score: 3.8, submitted_at: '2026-07-01', notes: 'ok',
          reviewer_name: 'D Head',
        },
        {
          reviewer_role: 'self' as never,
          criteria_scores: { c1: 5, c2: 3 },
          qualitative_responses: { f1: 'my year' },
          weighted_score: null, submitted_at: null, notes: null,
        },
      ],
    });
    expect(blocks.map((b) => b.role)).toEqual(['self', 'manager', 'dept_head']);
    expect(blocks[0].criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(blocks[0].submitted).toBe(false);
    expect(blocks[2].reviewerName).toBe('D Head');
    expect(blocks[2].criteria.find((c) => c.id === 'c1')).toMatchObject({ score: 4, comment: 'good', name: 'Quality' });
    expect(blocks[1].criteria.every((c) => c.score === null)).toBe(true);
  });

  it('builds system score rows with raw + points', () => {
    const rows = buildSystemScoreRows(template, { s1: 16 }, { s1: 92 });
    expect(rows).toEqual([{ id: 's1', name: 'Production', source: 'carry_kra', raw: 92, points: 16, weight: 20 }]);
  });
});
describe('buildStageMatrix (ADR-218f)', () => {
  const responses = [
    {
      reviewer_role: 'self' as never,
      criteria_scores: { c1: 5, c2: 3 },
      qualitative_responses: { f1: 'my year' },
      weighted_score: 80, submitted_at: '2026-07-01', notes: null,
    },
    {
      reviewer_role: 'dept_head' as never,
      criteria_scores: { c1: 4, cX: 2 },
      qualitative_responses: { c1: 'good' },
      weighted_score: 70, submitted_at: '2026-07-05', notes: 'ok',
      reviewer_name: 'D Head',
    },
  ];

  it('pivots stages into columns and criteria into rows', () => {
    const m = buildStageMatrix({ template, responses, enabledStages: ['self', 'dept_head'] as never });
    expect(m.stages.map((s) => s.role)).toEqual(['self', 'dept_head']);
    expect(m.rows.map((r) => r.id)).toEqual(['c1', 'c2', 'cX']);
    expect(m.rows[0].cells).toEqual([
      { score: 5, comment: null },
      { score: 4, comment: 'good' },
    ]);
  });

  it('keeps missing stage values as null cells', () => {
    const m = buildStageMatrix({ template, responses, enabledStages: ['self', 'manager', 'dept_head'] as never });
    expect(m.stages.map((s) => s.role)).toEqual(['self', 'manager', 'dept_head']);
    expect(m.rows[0].cells[1]).toEqual({ score: null, comment: null });
  });

  it('names unknown criterion ids by their raw id', () => {
    const m = buildStageMatrix({ template, responses, enabledStages: ['dept_head'] as never });
    expect(m.rows.find((r) => r.id === 'cX')?.name).toBe('cX');
  });
});

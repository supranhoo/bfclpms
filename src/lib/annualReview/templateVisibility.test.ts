import { describe, it, expect } from 'vitest';
import { criteriaForStage, systemScoresFullyAllocated, shouldHideCriteriaCard } from './templateVisibility';
import type { AnnualReviewTemplate, TemplateCriterion } from '@/types/annualReview';

function tpl(criteria: Partial<TemplateCriterion>[], systemWeights: number[] = []): AnnualReviewTemplate {
  return {
    id: 't', name: 'T', version: 1, is_active: true, created_at: '', updated_at: '',
    sections: {
      criteria: criteria.map((c, i) => ({
        id: c.id ?? `c${i}`, label: 'x', kind: 'rating' as any,
        weight: 1, reviewer_stages: c.reviewer_stages ?? [], ...c,
      })) as TemplateCriterion[],
      system_scores: systemWeights.map((w, i) => ({ id: `s${i}`, label: 's', weight: w } as any)),
    } as any,
  } as AnnualReviewTemplate;
}

describe('templateVisibility', () => {
  it('hides when no criteria exist', () => {
    expect(shouldHideCriteriaCard(tpl([]), 'self')).toBe(true);
    expect(shouldHideCriteriaCard(tpl([]), 'manager')).toBe(true);
  });

  it('hides per-stage when no criteria target that stage', () => {
    const t = tpl([{ reviewer_stages: ['manager'] }]);
    expect(shouldHideCriteriaCard(t, 'self')).toBe(true);
    expect(shouldHideCriteriaCard(t, 'manager')).toBe(false);
  });

  it('treats criteria with empty reviewer_stages as visible to all', () => {
    const t = tpl([{ reviewer_stages: [] }]);
    expect(shouldHideCriteriaCard(t, 'self')).toBe(false);
    expect(shouldHideCriteriaCard(t, 'hr')).toBe(false);
  });

  it('hides every stage when system scores sum to 100', () => {
    const t = tpl([{ reviewer_stages: ['self', 'manager'] }], [40, 60]);
    expect(systemScoresFullyAllocated(t)).toBe(true);
    expect(shouldHideCriteriaCard(t, 'self')).toBe(true);
    expect(shouldHideCriteriaCard(t, 'manager')).toBe(true);
  });

  it('shows when system scores sum to 99', () => {
    const t = tpl([{ reviewer_stages: ['self'] }], [40, 59]);
    expect(systemScoresFullyAllocated(t)).toBe(false);
    expect(shouldHideCriteriaCard(t, 'self')).toBe(false);
  });

  it('criteriaForStage returns the matching subset', () => {
    const t = tpl([
      { id: 'a', reviewer_stages: ['self'] },
      { id: 'b', reviewer_stages: ['manager'] },
      { id: 'c', reviewer_stages: [] },
    ]);
    expect(criteriaForStage(t, 'self').map((c) => c.id)).toEqual(['a', 'c']);
    expect(criteriaForStage(t, 'manager').map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('returns false when template is null', () => {
    expect(shouldHideCriteriaCard(null, 'self')).toBe(false);
  });
});
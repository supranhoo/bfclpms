import { describe, it, expect } from 'vitest';
import { resolveStageDisplayRating, toStageNumberMap, type StageScoreCell } from './kraStageDisplay';
import type { TemplateCriterion } from '@/types/annualReview';

const cell = (p: Partial<StageScoreCell>): StageScoreCell =>
  ({ weighted_score: null, scored: false, submitted: true, ...p });

const criteria: TemplateCriterion[] = [
  { id: 'c1', label: 'Quality', weight: 10, reviewer_stages: ['self', 'manager'] } as TemplateCriterion,
  { id: 'c2', label: 'Safety', weight: 10, reviewer_stages: ['self', 'manager'] } as TemplateCriterion,
];

describe('resolveStageDisplayRating (ADR-179)', () => {
  it('returns null when the stage never submitted', () => {
    expect(resolveStageDisplayRating({
      cell: undefined, criteria, role: 'self', isKraTemplate: false, kraRating: 4,
    })).toEqual({ value: null, source: null });
  });

  it('ADR-172: submitted but unscored on a criteria template stays blank', () => {
    expect(resolveStageDisplayRating({
      cell: cell({ weighted_score: 0, scored: false }),
      criteria, role: 'self', isKraTemplate: false, kraRating: null,
    })).toEqual({ value: null, source: null });
  });

  it('normalises a genuinely scored stage from criteria weights', () => {
    const r = resolveStageDisplayRating({
      cell: cell({ weighted_score: 80, scored: true }),
      criteria, role: 'self', isKraTemplate: false, kraRating: null,
    });
    expect(r.source).toBe('criteria');
    expect(r.value).toBeCloseTo(4);
  });

  it('ADR-130: KRA template with no criteria falls back to the KRA rating', () => {
    expect(resolveStageDisplayRating({
      cell: cell({ weighted_score: 0, scored: false }),
      criteria: [], role: 'manager', isKraTemplate: true, kraRating: 4.59,
    })).toEqual({ value: 4.59, source: 'kra' });
  });

  it('does not invent a KRA rating when none is resolvable', () => {
    expect(resolveStageDisplayRating({
      cell: cell({ weighted_score: 0, scored: false }),
      criteria: [], role: 'manager', isKraTemplate: true, kraRating: null,
    })).toEqual({ value: null, source: null });
  });
});

describe('toStageNumberMap', () => {
  it('keeps ADR-172 semantics for legacy numeric consumers', () => {
    expect(toStageNumberMap({
      self: cell({ weighted_score: 80, scored: true }),
      manager: cell({ weighted_score: 0, scored: false }),
    })).toEqual({ self: 80, manager: null });
  });
});

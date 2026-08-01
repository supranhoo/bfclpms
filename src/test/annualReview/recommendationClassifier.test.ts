import { describe, expect, it } from 'vitest';
import {
  classifyRecommendationText,
  parseRecommendationAmount,
  type RecommendationKeywordRule,
} from '@/lib/annualReview/recommendationClassifier';

/** Mock master data mirroring the seeded rows in the keywords table. */
const RULES: RecommendationKeywordRule[] = [
  { pattern: 'promot', type_key: 'promotion', weight: 3, is_active: true },
  { pattern: 'next level', type_key: 'promotion', weight: 2, is_active: true },
  { pattern: 'special incre(ment|ament|ase)', type_key: 'special_hike', weight: 3, is_active: true },
  { pattern: 'hike', type_key: 'special_hike', weight: 2, is_active: true },
  { pattern: 'bonus', type_key: 'one_time_reward', weight: 3, is_active: true },
  { pattern: 'training', type_key: 'training', weight: 3, is_active: true },
  { pattern: 'learning', type_key: 'training', weight: 1, is_active: true },
  { pattern: 'retired rule', type_key: 'promotion', weight: 9, is_active: false },
];

describe('parseRecommendationAmount', () => {
  it('reads a rupee amount', () => {
    expect(parseRecommendationAmount('Special increament of Rs.2000 for good work')).toEqual({
      kind: 'absolute',
      value: 2000,
    });
  });

  it('reads a comma-formatted amount', () => {
    expect(parseRecommendationAmount('Recommended Increment of Rs. 5,000')).toEqual({
      kind: 'absolute',
      value: 5000,
    });
  });

  it('reads a bracketed amount', () => {
    expect(parseRecommendationAmount('revise salary as per policy (2500)')).toEqual({
      kind: 'absolute',
      value: 2500,
    });
  });

  it('prefers percent over absolute when both appear', () => {
    expect(
      parseRecommendationAmount('promotion to SO with hike 25 Percent over Rs. 3000'),
    ).toEqual({ kind: 'percent', value: 25 });
  });

  it('reads a percent sign', () => {
    expect(parseRecommendationAmount('give him 12% hike')).toEqual({ kind: 'percent', value: 12 });
  });

  it('returns nothing for prose without an amount', () => {
    expect(parseRecommendationAmount('He is punctual and hard working')).toEqual({
      kind: null,
      value: null,
    });
  });

  it('handles empty input', () => {
    expect(parseRecommendationAmount('')).toEqual({ kind: null, value: null });
    expect(parseRecommendationAmount(null)).toEqual({ kind: null, value: null });
  });
});

describe('classifyRecommendationText', () => {
  it('classifies a confident promotion with a percent ask', () => {
    const r = classifyRecommendationText(
      'Recommended for promotion to SO with hike 25 Percent considering his contribution.',
      RULES,
    );
    expect(r.typeKeys[0]).toBe('promotion');
    expect(r.typeKeys).toContain('special_hike');
    expect(r.status).toBe('submitted');
    expect(r.amount).toEqual({ kind: 'percent', value: 25 });
  });

  it('classifies a special hike with a rupee ask', () => {
    const r = classifyRecommendationText('Special increament of Rs.2000 due to hard work', RULES);
    expect(r.typeKeys[0]).toBe('special_hike');
    expect(r.status).toBe('submitted');
    expect(r.amount).toEqual({ kind: 'absolute', value: 2000 });
  });

  it('marks a weak single low-weight match as needing classification', () => {
    const r = classifyRecommendationText('More learning is required', RULES);
    expect(r.typeKeys).toEqual(['training']);
    expect(r.bestScore).toBe(1);
    expect(r.status).toBe('needs_classification');
  });

  it('falls back to none for prose with no ask', () => {
    const r = classifyRecommendationText('Please proceed as applicable.', RULES);
    expect(r.typeKeys).toEqual(['none']);
    expect(r.status).toBe('needs_classification');
  });

  it('ignores inactive rules', () => {
    const r = classifyRecommendationText('retired rule mentioned here', RULES);
    expect(r.typeKeys).toEqual(['none']);
  });

  it('survives an invalid admin-entered pattern', () => {
    const bad: RecommendationKeywordRule[] = [
      { pattern: '([unclosed', type_key: 'promotion', weight: 3, is_active: true },
      ...RULES,
    ];
    const r = classifyRecommendationText('Kindly promote him to supervisor', bad);
    expect(r.typeKeys).toContain('promotion');
  });

  it('handles empty prose', () => {
    const r = classifyRecommendationText('   ', RULES);
    expect(r.typeKeys).toEqual(['none']);
    expect(r.status).toBe('needs_classification');
  });
});
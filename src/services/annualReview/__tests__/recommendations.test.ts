import { describe, it, expect } from 'vitest';
import {
  formatRecommendationAmount,
  RECOMMENDATION_STATUS_LABEL,
  type RecommendationStatus,
} from '@/services/annualReview/recommendations';

describe('ADR-226 recommendation formatting', () => {
  it('renders percentage asks without trailing zeros', () => {
    expect(formatRecommendationAmount('percent', 8)).toBe('8%');
    expect(formatRecommendationAmount('percent', 8.5)).toBe('8.50%');
  });

  it('renders absolute asks in Indian grouping', () => {
    expect(formatRecommendationAmount('absolute', 5000)).toBe('₹5,000');
    expect(formatRecommendationAmount('absolute', 150000)).toBe('₹1,50,000');
  });

  it('falls back to an em dash when the ask is unset (edge case)', () => {
    expect(formatRecommendationAmount(null, null)).toBe('—');
    expect(formatRecommendationAmount('percent', null)).toBe('—');
    expect(formatRecommendationAmount(null, 10)).toBe('—');
  });

  it('labels every persisted status (no raw enum leaks to the UI)', () => {
    const all: RecommendationStatus[] = [
      'draft', 'submitted', 'needs_classification', 'approved',
      'approved_modified', 'rejected', 'deferred', 'implemented',
    ];
    for (const s of all) expect(RECOMMENDATION_STATUS_LABEL[s]).toBeTruthy();
  });
});

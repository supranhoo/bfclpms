import { describe, it, expect } from 'vitest';
import {
  isNormalisedTotalScore,
  normaliseCriteriaPoints,
  resolveFinalRating,
  classifyFinalScoreIntegrity,
} from '@/lib/annualReview/finalScoreScale';

describe('ADR-187 — final score scale invariant', () => {
  it('accepts normalised scores and null (in-flight) scores', () => {
    expect(isNormalisedTotalScore(0)).toBe(true);
    expect(isNormalisedTotalScore(79.6)).toBe(true);
    expect(isNormalisedTotalScore(100)).toBe(true);
    expect(isNormalisedTotalScore(null)).toBe(true);
    expect(isNormalisedTotalScore(undefined)).toBe(true);
  });

  it('rejects raw weighted sums leaking into total_score', () => {
    // Real defective values observed on 42 instances (18/20-Jul finalisations).
    for (const raw of [255, 270, 315, 340, 450]) {
      expect(isNormalisedTotalScore(raw)).toBe(false);
    }
    expect(isNormalisedTotalScore(-1)).toBe(false);
    expect(isNormalisedTotalScore(Number.NaN)).toBe(false);
  });

  it('normalises a raw weighted criteria total into the criteria pool', () => {
    // 255 / 425 max × 82-point pool = 49.2
    expect(normaliseCriteriaPoints(255, 425, 82)).toBeCloseTo(49.2, 5);
    // Guard rails
    expect(normaliseCriteriaPoints(255, 0, 82)).toBe(0);
    expect(normaliseCriteriaPoints(Number.NaN, 425, 82)).toBe(0);
  });

  it('maps rating bands at their boundaries', () => {
    expect(resolveFinalRating(92)).toBe('Outstanding');
    expect(resolveFinalRating(85)).toBe('Outstanding');
    expect(resolveFinalRating(84.9)).toBe('Good');
    expect(resolveFinalRating(70)).toBe('Good');
    expect(resolveFinalRating(67)).toBe('Average');
    expect(resolveFinalRating(55)).toBe('Average');
    expect(resolveFinalRating(54.9)).toBe('Poor');
    expect(resolveFinalRating(0)).toBe('Poor');
    expect(resolveFinalRating(null)).toBeNull();
  });

  it('classifies drift for the admin monitor', () => {
    expect(classifyFinalScoreIntegrity({
      overall_status: 'completed', total_score: 315, final_rating: null,
    })).toBe('out_of_range');

    // 100638 Lakhee Kant Mahto — normalised total, blank band.
    expect(classifyFinalScoreIntegrity({
      overall_status: 'completed', total_score: 79.6, final_rating: '',
    })).toBe('missing_rating');

    expect(classifyFinalScoreIntegrity({
      overall_status: 'completed', total_score: 79.6, final_rating: 'Good',
    })).toBeNull();

    // In-flight reviews without a score are not a defect.
    expect(classifyFinalScoreIntegrity({
      overall_status: 'pending_bu', total_score: null, final_rating: null,
    })).toBeNull();
  });
});

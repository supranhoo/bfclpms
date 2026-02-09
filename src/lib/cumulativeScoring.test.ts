import { describe, it, expect } from 'vitest';
import {
  calculateCumulativeScore,
  calculateTrend,
  calculateTrendFromPeriodScores,
  getScoreForPeriod,
  formatTrendLabel,
} from './cumulativeScoring';
import type { PeriodScore } from './cumulativeScoring';

describe('calculateCumulativeScore', () => {
  it('returns null for empty array', () => {
    expect(calculateCumulativeScore([])).toBeNull();
  });

  it('returns null when all scores are null', () => {
    expect(calculateCumulativeScore([{ score: null }, { score: null }])).toBeNull();
  });

  it('returns the score for single valid entry', () => {
    expect(calculateCumulativeScore([{ score: 4 }])).toBe(4);
  });

  it('calculates simple average when no weightage', () => {
    const result = calculateCumulativeScore([{ score: 3 }, { score: 5 }]);
    expect(result).toBe(4);
  });

  it('calculates weighted average when all have weightage', () => {
    const result = calculateCumulativeScore([
      { score: 4, weightage: 30 },
      { score: 2, weightage: 70 },
    ]);
    // (4*30 + 2*70) / 100 = 260/100 = 2.6
    expect(result).toBe(2.6);
  });

  it('filters out null scores before averaging', () => {
    const result = calculateCumulativeScore([{ score: 4 }, { score: null }, { score: 2 }]);
    expect(result).toBe(3);
  });

  it('falls back to simple average when weightage is 0', () => {
    // weightage: 0 fails the hasWeightage check, so falls back to simple average
    expect(calculateCumulativeScore([{ score: 4, weightage: 0 }])).toBe(4);
  });
});

describe('calculateTrend', () => {
  it('returns stable for fewer than 2 data points', () => {
    expect(calculateTrend([4])).toBe('stable');
    expect(calculateTrend([])).toBe('stable');
  });

  it('returns stable for all null values', () => {
    expect(calculateTrend([null, null])).toBe('stable');
  });

  it('detects improving trend', () => {
    expect(calculateTrend([1, 2, 3])).toBe('improving');
  });

  it('detects declining trend', () => {
    expect(calculateTrend([5, 3, 1])).toBe('declining');
  });

  it('returns stable for flat scores', () => {
    expect(calculateTrend([3, 3, 3])).toBe('stable');
  });

  it('uses last 3 periods only', () => {
    // Even though early scores decline, last 3 improve
    const result = calculateTrend([5, 4, 1, 2, 3]);
    expect(result).toBe('improving');
  });
});

describe('calculateTrendFromPeriodScores', () => {
  it('sorts by year then month before calculating', () => {
    const scores: PeriodScore[] = [
      { period: 'March', year: 2025, score: 3 },
      { period: 'January', year: 2025, score: 1 },
      { period: 'February', year: 2025, score: 2 },
    ];
    expect(calculateTrendFromPeriodScores(scores)).toBe('improving');
  });

  it('handles cross-year ordering', () => {
    const scores: PeriodScore[] = [
      { period: 'January', year: 2026, score: 5 },
      { period: 'November', year: 2025, score: 3 },
      { period: 'December', year: 2025, score: 4 },
    ];
    expect(calculateTrendFromPeriodScores(scores)).toBe('improving');
  });

  it('returns stable for single period', () => {
    expect(calculateTrendFromPeriodScores([{ period: 'January', year: 2025, score: 4 }])).toBe('stable');
  });
});

describe('getScoreForPeriod', () => {
  const scores: PeriodScore[] = [
    { period: 'January', year: 2025, score: 3 },
    { period: 'February', year: 2025, score: 4 },
  ];

  it('finds matching period', () => {
    expect(getScoreForPeriod(scores, 'January', 2025)).toBe(3);
  });

  it('returns null for non-matching period', () => {
    expect(getScoreForPeriod(scores, 'March', 2025)).toBeNull();
  });
});

describe('formatTrendLabel', () => {
  it('formats all trend directions', () => {
    expect(formatTrendLabel('improving')).toBe('Improving');
    expect(formatTrendLabel('declining')).toBe('Declining');
    expect(formatTrendLabel('stable')).toBe('Stable');
  });
});

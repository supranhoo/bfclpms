import { describe, it, expect } from 'vitest';
import {
  getExpectedDaysInMonth,
  getExpectedDaysWithConfig,
  calculateAverageScore,
  calculateMissedDaysPenaltyScore,
  calculateBinaryDailyScoreWithExpectedDays,
  calculateBinaryDailyScore,
  calculateDailyAggregatedScoreWithExpectedDays,
  calculateDailyAggregatedScore,
  getAggregationMethodLabel,
  getAggregationMethodDescription,
  getDayCountTypeLabel,
} from './dailyAggregation';

describe('getExpectedDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getExpectedDaysInMonth('January', 2026)).toBe(31);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(getExpectedDaysInMonth('February', 2025)).toBe(28);
  });

  it('returns 29 for February in leap year', () => {
    expect(getExpectedDaysInMonth('February', 2024)).toBe(29);
  });

  it('returns 30 for April', () => {
    expect(getExpectedDaysInMonth('April', 2026)).toBe(30);
  });
});

describe('getExpectedDaysWithConfig', () => {
  it('returns calendar days for all_days type', () => {
    expect(getExpectedDaysWithConfig('January', 2026, 'all_days')).toBe(31);
  });

  it('returns provided working days count', () => {
    expect(getExpectedDaysWithConfig('January', 2026, 'working_days', 20)).toBe(20);
  });

  it('returns global default when no working days provided', () => {
    expect(getExpectedDaysWithConfig('January', 2026, 'working_days')).toBe(22);
  });

  it('uses custom global default', () => {
    expect(getExpectedDaysWithConfig('January', 2026, 'working_days', undefined, 25)).toBe(25);
  });
});

describe('calculateAverageScore', () => {
  it('returns null for empty array', () => {
    expect(calculateAverageScore([])).toBeNull();
  });

  it('returns the value for single element', () => {
    expect(calculateAverageScore([4])).toBe(4);
  });

  it('calculates average of multiple values', () => {
    expect(calculateAverageScore([3, 4, 5])).toBe(4);
  });

  it('handles decimal averages', () => {
    expect(calculateAverageScore([3, 4])).toBe(3.5);
  });
});

describe('calculateMissedDaysPenaltyScore', () => {
  it('returns 5 for 0 missed days', () => {
    expect(calculateMissedDaysPenaltyScore(22, 22)).toBe(5);
  });

  it('returns 4 for 1 missed day', () => {
    expect(calculateMissedDaysPenaltyScore(21, 22)).toBe(4);
  });

  it('returns 3 for 2 missed days', () => {
    expect(calculateMissedDaysPenaltyScore(20, 22)).toBe(3);
  });

  it('returns 0 for 5+ missed days', () => {
    expect(calculateMissedDaysPenaltyScore(17, 22)).toBe(0);
    expect(calculateMissedDaysPenaltyScore(10, 22)).toBe(0);
  });

  it('handles more submitted than expected gracefully', () => {
    expect(calculateMissedDaysPenaltyScore(25, 22)).toBe(5);
  });
});

describe('calculateBinaryDailyScoreWithExpectedDays', () => {
  it('scores 5 when all days submitted as Yes', () => {
    const result = calculateBinaryDailyScoreWithExpectedDays([1, 1, 1], 3);
    expect(result.score).toBe(5);
    expect(result.totalNoCount).toBe(0);
  });

  it('scores based on No submissions + missed days', () => {
    // 2 submitted (1 Yes, 1 No), total 3 days → 1 missed + 1 No = 2 total No → score 3
    const result = calculateBinaryDailyScoreWithExpectedDays([1, 0], 3);
    expect(result.score).toBe(3);
    expect(result.missedDays).toBe(1);
    expect(result.noSubmissions).toBe(1);
    expect(result.totalNoCount).toBe(2);
  });

  it('scores 0 when all No and many missed', () => {
    const result = calculateBinaryDailyScoreWithExpectedDays([0, 0], 10);
    expect(result.score).toBe(0);
  });

  it('returns method as missed_days_penalty', () => {
    const result = calculateBinaryDailyScoreWithExpectedDays([1], 1);
    expect(result.method).toBe('missed_days_penalty');
  });
});

describe('calculateBinaryDailyScore', () => {
  it('delegates to calculateBinaryDailyScoreWithExpectedDays using calendar days', () => {
    const result = calculateBinaryDailyScore([1, 1, 1], 'January', 2026);
    expect(result.totalDays).toBe(31);
    expect(result.submittedDays).toBe(3);
  });
});

describe('calculateDailyAggregatedScoreWithExpectedDays', () => {
  it('dispatches to average method', () => {
    const result = calculateDailyAggregatedScoreWithExpectedDays([3, 4, 5], 'average', 22);
    expect(result.score).toBe(4);
    expect(result.method).toBe('average');
  });

  it('dispatches to missed_days_penalty method', () => {
    const result = calculateDailyAggregatedScoreWithExpectedDays([3, 4, 5], 'missed_days_penalty', 22);
    expect(result.score).toBe(0); // 22-3=19 missed
    expect(result.method).toBe('missed_days_penalty');
  });

  it('returns null for missed_days_penalty with no submissions', () => {
    const result = calculateDailyAggregatedScoreWithExpectedDays([], 'missed_days_penalty', 22);
    expect(result.score).toBeNull();
  });

  it('dispatches to binary logic for binary KPI + missed_days_penalty', () => {
    const result = calculateDailyAggregatedScoreWithExpectedDays([1, 0], 'missed_days_penalty', 3, true);
    expect('noSubmissions' in result).toBe(true);
  });
});

describe('calculateDailyAggregatedScore', () => {
  it('uses calendar days for total', () => {
    const result = calculateDailyAggregatedScore([4, 5], 'average', 'January', 2026);
    expect(result.totalDays).toBe(31);
    expect(result.score).toBe(4.5);
  });
});

describe('getAggregationMethodLabel', () => {
  it('returns Average for average', () => {
    expect(getAggregationMethodLabel('average')).toBe('Average');
  });

  it('returns Missed Days Penalty for missed_days_penalty', () => {
    expect(getAggregationMethodLabel('missed_days_penalty')).toBe('Missed Days Penalty');
  });
});

describe('getAggregationMethodDescription', () => {
  it('returns description for average', () => {
    expect(getAggregationMethodDescription('average')).toContain('average');
  });

  it('returns description for missed_days_penalty', () => {
    expect(getAggregationMethodDescription('missed_days_penalty')).toContain('missed');
  });
});

describe('getDayCountTypeLabel', () => {
  it('returns Working Days Only', () => {
    expect(getDayCountTypeLabel('working_days')).toBe('Working Days Only');
  });

  it('returns All Calendar Days', () => {
    expect(getDayCountTypeLabel('all_days')).toBe('All Calendar Days');
  });
});

/**
 * Daily KPI Aggregation Methods
 * 
 * Supports two aggregation models:
 * 1. Average: Simple average of all submitted daily values
 * 2. Missed Days Penalty: Score based on number of missed days
 *    - 0 missed = 5, 1 missed = 4, 2 missed = 3, 3 missed = 2, 4 missed = 1, 5+ missed = 0
 */

import { getDaysInMonth } from 'date-fns';
import { getMonthNumber } from './frequencyUtils';

export type DailyAggregationMethod = 'average' | 'missed_days_penalty';

export interface AggregationResult {
  score: number | null;
  method: DailyAggregationMethod;
  submittedDays: number;
  totalDays: number;
  missedDays: number;
}

/**
 * Get the total number of working/expected days in a month for daily submissions
 * By default, assumes all calendar days are expected (can be customized)
 */
export function getExpectedDaysInMonth(month: string, year: number): number {
  const monthNum = getMonthNumber(month);
  return getDaysInMonth(new Date(year, monthNum - 1));
}

/**
 * Calculate score using the Average method
 * Returns the simple average of all submitted values
 */
export function calculateAverageScore(submittedValues: number[]): number | null {
  if (submittedValues.length === 0) return null;
  const sum = submittedValues.reduce((acc, val) => acc + val, 0);
  return sum / submittedValues.length;
}

/**
 * Calculate score using the Missed Days Penalty method
 * Score is based on number of missed days:
 * - 0 missed = 5 (perfect)
 * - 1 missed = 4
 * - 2 missed = 3
 * - 3 missed = 2
 * - 4 missed = 1
 * - 5+ missed = 0
 */
export function calculateMissedDaysPenaltyScore(
  submittedDays: number,
  totalExpectedDays: number
): number {
  const missedDays = Math.max(0, totalExpectedDays - submittedDays);
  
  // Score mapping: 0 missed = 5, each missed day reduces by 1, minimum 0
  const score = Math.max(0, 5 - missedDays);
  return score;
}

/**
 * Main aggregation function that calculates the monthly score based on the selected method
 */
export function calculateDailyAggregatedScore(
  submittedValues: number[],
  method: DailyAggregationMethod,
  month: string,
  year: number
): AggregationResult {
  const totalDays = getExpectedDaysInMonth(month, year);
  const submittedDays = submittedValues.length;
  const missedDays = Math.max(0, totalDays - submittedDays);

  let score: number | null = null;

  if (method === 'average') {
    score = calculateAverageScore(submittedValues);
  } else if (method === 'missed_days_penalty') {
    score = submittedDays > 0 
      ? calculateMissedDaysPenaltyScore(submittedDays, totalDays)
      : null;
  }

  return {
    score,
    method,
    submittedDays,
    totalDays,
    missedDays,
  };
}

/**
 * Get the display label for the aggregation method
 */
export function getAggregationMethodLabel(method: DailyAggregationMethod): string {
  switch (method) {
    case 'average':
      return 'Average';
    case 'missed_days_penalty':
      return 'Missed Days Penalty';
    default:
      return 'Average';
  }
}

/**
 * Get description for the aggregation method
 */
export function getAggregationMethodDescription(method: DailyAggregationMethod): string {
  switch (method) {
    case 'average':
      return 'Monthly score is the average of all daily submitted values';
    case 'missed_days_penalty':
      return 'Score based on missed days: 5 (0 missed), 4 (1 missed), 3 (2 missed), etc.';
    default:
      return '';
  }
}

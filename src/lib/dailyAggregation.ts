/**
 * Daily KPI Aggregation Methods
 * 
 * Supports two aggregation models:
 * 1. Average: Simple average of all submitted daily values
 * 2. Missed Days Penalty: Score based on number of missed days
 *    - 0 missed = 5, 1 missed = 4, 2 missed = 3, 3 missed = 2, 4 missed = 1, 5+ missed = 0
 * 
 * For Binary KPIs with Missed Days Penalty:
 * - Total No = Missed Days + "No" Submissions (achieved_value = 0)
 * - Score: 0 No = 5, 1 No = 4, 2 No = 3, 3 No = 2, 4 No = 1, >4 No = 0
 */

import { getDaysInMonth } from 'date-fns';
import { getMonthNumber } from './frequencyUtils';

export type DailyAggregationMethod = 'average' | 'missed_days_penalty';
export type DayCountType = 'working_days' | 'all_days';

export interface AggregationResult {
  score: number | null;
  method: DailyAggregationMethod;
  submittedDays: number;
  totalDays: number;
  missedDays: number;
  /**
   * v2.66.7.x — Raw SUM of submitted daily/weekly achieved values.
   * This is the authoritative aggregated value that should be mapped through
   * the KPI's R5..R0 thresholds to derive the final 0–5 rating.
   * (Supersedes ADR-046 — the legacy `score` field below is now treated as a
   * compliance/penalty metric only, not the rating.)
   */
  sumValue: number | null;
}

export interface BinaryAggregationResult extends AggregationResult {
  noSubmissions: number;    // Count of "No" (achieved_value = 0)
  totalNoCount: number;     // missedDays + noSubmissions
}

/**
 * Get the total number of calendar days in a month
 * This is the synchronous version for backwards compatibility
 */
export function getExpectedDaysInMonth(month: string, year: number): number {
  const monthNum = getMonthNumber(month);
  return getDaysInMonth(new Date(year, monthNum - 1));
}

/**
 * Get the expected days based on day_count_type
 * For 'all_days': returns all calendar days in the month
 * For 'working_days': returns the provided working days count (from employee config or global default)
 */
export function getExpectedDaysWithConfig(
  month: string,
  year: number,
  dayCountType: DayCountType = 'working_days',
  workingDaysCount?: number,
  globalDefaultDays: number = 22
): number {
  // All calendar days - use date-fns
  if (dayCountType === 'all_days') {
    const monthNum = getMonthNumber(month);
    return getDaysInMonth(new Date(year, monthNum - 1));
  }
  
  // Working days mode - use provided count or global default
  return workingDaysCount ?? globalDefaultDays;
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
 * Calculate score for binary daily KPIs with explicit expected days
 * Total No = Missed Days + "No" submissions (achieved_value = 0)
 * Score: 0 No = 5, 1 No = 4, 2 No = 3, 3 No = 2, 4 No = 1, >4 No = 0
 */
export function calculateBinaryDailyScoreWithExpectedDays(
  submittedValues: number[],
  totalDays: number
): BinaryAggregationResult {
  const submittedDays = submittedValues.length;
  const missedDays = Math.max(0, totalDays - submittedDays);
  
  // Count "No" submissions (achieved_value = 0)
  const noSubmissions = submittedValues.filter(v => v === 0).length;
  
  // Total No = missed days + "No" submissions
  const totalNoCount = missedDays + noSubmissions;
  
  // Score calculation: 0 No = 5, each No reduces by 1, minimum 0
  const score = Math.max(0, 5 - totalNoCount);

  return {
    score,
    method: 'missed_days_penalty',
    submittedDays,
    totalDays,
    missedDays,
    noSubmissions,
    totalNoCount,
  };
}

/**
 * Calculate score for binary daily KPIs (backwards compatible version)
 */
export function calculateBinaryDailyScore(
  submittedValues: number[],
  month: string,
  year: number
): BinaryAggregationResult {
  const totalDays = getExpectedDaysInMonth(month, year);
  return calculateBinaryDailyScoreWithExpectedDays(submittedValues, totalDays);
}

/**
 * Main aggregation function with explicit expected days parameter
 * This version accepts pre-calculated expected days for flexibility
 */
export function calculateDailyAggregatedScoreWithExpectedDays(
  submittedValues: number[],
  method: DailyAggregationMethod,
  totalDays: number,
  isBinaryKpi: boolean = false
): AggregationResult | BinaryAggregationResult {
  // For binary KPIs with missed_days_penalty, use the binary-specific logic
  if (isBinaryKpi && method === 'missed_days_penalty') {
    return calculateBinaryDailyScoreWithExpectedDays(submittedValues, totalDays);
  }

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
 * Main aggregation function that calculates the monthly score based on the selected method
 * Backwards compatible version that uses calendar days
 * @param isBinaryKpi - If true and method is 'missed_days_penalty', uses binary-specific logic
 */
export function calculateDailyAggregatedScore(
  submittedValues: number[],
  method: DailyAggregationMethod,
  month: string,
  year: number,
  isBinaryKpi: boolean = false
): AggregationResult | BinaryAggregationResult {
  // For binary KPIs with missed_days_penalty, use the new binary-specific logic
  if (isBinaryKpi && method === 'missed_days_penalty') {
    return calculateBinaryDailyScore(submittedValues, month, year);
  }

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

/**
 * Get the display label for the day count type
 */
export function getDayCountTypeLabel(type: DayCountType): string {
  switch (type) {
    case 'working_days':
      return 'Working Days Only';
    case 'all_days':
      return 'All Calendar Days';
    default:
      return 'Working Days Only';
  }
}

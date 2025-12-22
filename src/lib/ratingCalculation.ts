/**
 * PMS Rating Calculation Utility
 * 
 * Calculates ratings based on achieved value vs target using R5-R0 thresholds
 * Supports both "Higher is Better" and "Lower is Better" criteria
 */

export type RatingLevel = 'blue' | 'green' | 'yellow' | 'red';

export interface RatingThresholds {
  r5: string | number | null; // Rating 5 (Exceptional)
  r4: string | number | null; // Rating 4 (Exceeds Expectations)
  r3: string | number | null; // Rating 3 (Meets Expectations)
  r2: string | number | null; // Rating 2 (Below Expectations)
  r1: string | number | null; // Rating 1 (Needs Improvement)
  r0?: string | number | null; // Rating 0 (Not Achieved)
}

export interface RatingResult {
  rating: number; // 0-5 numeric rating
  ratingLevel: RatingLevel; // Color-based rating
  weightedScore: number; // rating * weightage / 100
  percentage: number; // achievement percentage
}

/**
 * Parse a threshold value to a number
 */
export function parseThreshold(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  
  // Remove % sign and parse
  const cleanValue = String(value).replace('%', '').trim();
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Convert numeric rating (0-5) to color-based rating level
 */
export function ratingToLevel(rating: number): RatingLevel {
  if (rating >= 4) return 'blue';    // Exceptional (4-5)
  if (rating >= 3) return 'green';   // Meets/Exceeds (3-3.99)
  if (rating >= 2) return 'yellow';  // Below Expectations (2-2.99)
  return 'red';                       // Needs Improvement (0-1.99)
}

/**
 * Convert color-based rating level to display text
 */
export function levelToText(level: RatingLevel): string {
  switch (level) {
    case 'blue': return 'Exceptional';
    case 'green': return 'Meets Expectations';
    case 'yellow': return 'Below Expectations';
    case 'red': return 'Needs Improvement';
  }
}

/**
 * Calculate rating based on achieved value, thresholds, and criteria
 * 
 * @param achievedValue - The actual achieved value
 * @param target - The target value
 * @param thresholds - R5-R0 threshold values
 * @param criteria - "Higher is Better" or "Lower is Better"
 * @param weightage - KPI weightage (0-100)
 */
export function calculateRating(
  achievedValue: number | null | undefined,
  target: number | null | undefined,
  thresholds: RatingThresholds,
  criteria: string = 'Higher is Better',
  weightage: number = 0
): RatingResult {
  // If no achieved value, return zero rating
  if (achievedValue === null || achievedValue === undefined) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0 };
  }

  const achieved = parseThreshold(achievedValue) ?? 0;
  const targetVal = parseThreshold(target) ?? 0;
  
  // Parse all thresholds
  const r5 = parseThreshold(thresholds.r5);
  const r4 = parseThreshold(thresholds.r4);
  const r3 = parseThreshold(thresholds.r3);
  const r2 = parseThreshold(thresholds.r2);
  const r1 = parseThreshold(thresholds.r1);
  const r0 = parseThreshold(thresholds.r0);

  let rating = 0;
  
  const isHigherBetter = !criteria || 
    criteria.toLowerCase().includes('higher') || 
    criteria.toLowerCase().includes('more');

  if (isHigherBetter) {
    // Higher is Better: higher achieved = higher rating
    if (r5 !== null && achieved >= r5) rating = 5;
    else if (r4 !== null && achieved >= r4) rating = 4;
    else if (r3 !== null && achieved >= r3) rating = 3;
    else if (r2 !== null && achieved >= r2) rating = 2;
    else if (r1 !== null && achieved >= r1) rating = 1;
    else rating = 0;
  } else {
    // Lower is Better: lower achieved = higher rating
    if (r5 !== null && achieved <= r5) rating = 5;
    else if (r4 !== null && achieved <= r4) rating = 4;
    else if (r3 !== null && achieved <= r3) rating = 3;
    else if (r2 !== null && achieved <= r2) rating = 2;
    else if (r1 !== null && achieved <= r1) rating = 1;
    else rating = 0;
  }

  // Calculate percentage achievement
  const percentage = targetVal > 0 ? (achieved / targetVal) * 100 : 0;

  // Calculate weighted score
  const weightedScore = (rating * weightage) / 100;

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore,
    percentage,
  };
}

/**
 * Calculate overall score from multiple KPI ratings
 */
export function calculateOverallScore(
  kpiResults: Array<{ rating: number; weightage: number }>
): { overallRating: number; overallLevel: RatingLevel } {
  const totalWeightage = kpiResults.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);
  
  if (totalWeightage === 0) {
    return { overallRating: 0, overallLevel: 'red' };
  }

  const weightedSum = kpiResults.reduce((sum, kpi) => {
    return sum + (kpi.rating * (kpi.weightage || 0));
  }, 0);

  const overallRating = weightedSum / totalWeightage;
  
  return {
    overallRating: Math.round(overallRating * 100) / 100,
    overallLevel: ratingToLevel(overallRating),
  };
}

/**
 * Get status flow for review process
 */
export const REVIEW_STATUS_FLOW: Record<string, { next: string | null; label: string }> = {
  'kra_set': { next: 'self_review', label: 'KRA Set' },
  'self_review': { next: 'manager_check', label: 'Self Review' },
  'manager_check': { next: 'audit', label: 'Manager Review' },
  'audit': { next: 'approved', label: 'Audit Review' },
  'approved': { next: null, label: 'Approved' },
};

export function getNextStatus(currentStatus: string): string | null {
  return REVIEW_STATUS_FLOW[currentStatus]?.next || null;
}

export function getStatusLabel(status: string): string {
  return REVIEW_STATUS_FLOW[status]?.label || status;
}

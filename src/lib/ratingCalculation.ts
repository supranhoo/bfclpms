/**
 * PMS Rating Calculation Utility
 * 
 * Calculates ratings based on achieved value vs target using R5-R0 thresholds
 * Supports both "Higher is Better" and "Lower is Better" criteria
 * Supports qualitative UOM types (binary, tiered)
 */

export type { QualitativeOption } from '@/lib/qualitativeUom';
import { UomType, QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';

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
  weightedScore: number; // weightage * rating
  percentage: number; // achievement percentage (achievedWeight * 100)
  achievedWeight: number; // ratio value used for rating calculation
}

/**
 * Parse a threshold value to a number
 */
/**
 * Parse a threshold value to a number
 * @param value - The threshold value
 * @param asRatio - If true, convert percentages to ratios (90% → 0.9). If false, treat as absolute.
 */
export function parseThreshold(value: string | number | null | undefined, asRatio: boolean = true): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const raw = String(value).trim();
  const hasPercent = raw.includes('%');

  // Strip comparison operators (>, <, >=, <=) and % sign
  // Handle both "99.95%" and "99,95%" formats
  const cleanValue = raw
    .replace(/^[><]=?/, '')  // Remove leading >, <, >=, <=
    .replace('%', '')
    .replace(',', '.')
    .trim();
  const parsed = parseFloat(cleanValue);
  if (isNaN(parsed)) return null;

  // If asRatio=true and value contains % OR looks like a percentage (>1), convert to ratio
  // This handles "99.95%" → 0.9995 and also bare "99.95" when it should be a percentage
  if (asRatio) {
    // If has % sign, definitely a percentage - divide by 100
    // If no % but value > 1, assume it's a percentage value like 99.95 → 0.9995
    if (hasPercent || parsed > 1) {
      return parsed / 100;
    }
    // Value is already a ratio (0-1 range)
    return parsed;
  }
  
  // asRatio=false: treat as absolute number
  return parsed;
}

/**
 * Convert numeric rating (0-5) to color-based rating level
 */
export function ratingToLevel(rating: number): RatingLevel {
  if (rating >= 5) return 'blue';    // Outstanding (5)
  if (rating >= 4) return 'green';   // Exceeds Expectations (4-4.99)
  if (rating >= 3) return 'yellow';  // Meets Expectations (3-3.99)
  return 'red';                       // Below / Needs Improvement / Not Achieved (0-2.99)
}

/**
 * Dev-only guard: warns when threshold cascade is non-monotonic.
 * Lower-is-Better expects R5 ≤ R4 ≤ R3 ≤ R2 ≤ R1 ≤ R0
 * Higher-is-Better expects R5 ≥ R4 ≥ R3 ≥ R2 ≥ R1 ≥ R0
 * A typo (e.g. R2=1 sandwiched between R3=100 and R1=101) breaks the cascade
 * and silently scores values as 0. We log once per call site in dev.
 */
function warnIfNonMonotonic(
  values: { r5: number | null; r4: number | null; r3: number | null; r2: number | null; r1: number | null; r0: number | null },
  criteria: string,
  source: string
): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return;
  const order = [values.r5, values.r4, values.r3, values.r2, values.r1, values.r0];
  const isLowerBetter = criteria?.toLowerCase().includes('lower');
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i];
    const b = order[i + 1];
    if (a === null || b === null) continue;
    const ok = isLowerBetter ? a <= b : a >= b;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[${source}] Non-monotonic thresholds for "${criteria}": R${5 - i}=${a}, R${4 - i}=${b}. ` +
        `Likely a master-data typo — scoring may yield unexpected 0s.`
      );
      return;
    }
  }
}

/**
 * Convert color-based rating level to display text
 */
export function levelToText(level: RatingLevel): string {
  switch (level) {
    case 'blue': return 'Outstanding';
    case 'green': return 'Exceeds Expectations';
    case 'yellow': return 'Meets Expectations';
    case 'red': return 'Below Expectations';
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
/**
 * Calculate rating based on achieved value, thresholds, and criteria
 * 
 * Logic matches Excel formula:
 * - achievedWeight = (criteria == "Lower is Better") ? target/achieved : achieved/target
 * - If target is 0: compare achieved directly against thresholds (lower = better)
 * - Else: compare achievedWeight ratio against thresholds
 * 
 * @param achievedValue - The actual achieved value
 * @param target - The target value
 * @param thresholds - R5-R0 threshold values (as ratios like 1.0, 0.95, 0.9, etc.)
 * @param criteria - "Higher is Better" or "Lower is Better"
 * @param weightage - KPI weightage (0-100)
 * @param uomType - Type of UOM: 'numeric' | 'binary' | 'tiered' (optional, defaults to 'numeric')
 * @param qualitativeOptions - Options for tiered UOM (optional)
 * @param uom - Unit of Measure string (e.g., 'Date', '%', 'Number') for special handling
 * @param thresholdMode - 'absolute' for direct value comparison, 'ratio' for legacy percentage-based
 */
export function calculateRating(
  achievedValue: number | string | null | undefined,
  target: number | null | undefined,
  thresholds: RatingThresholds,
  criteria: string = 'Higher is Better',
  weightage: number = 0,
  uomType: UomType = 'numeric',
  qualitativeOptions?: QualitativeOption[] | null,
  uom?: string | null,
  thresholdMode: 'absolute' | 'ratio' = 'absolute'
): RatingResult {
  // Handle Date UOM specially - compare day values directly against thresholds
  if (uom === 'Date') {
    return calculateDateRating(achievedValue, thresholds, weightage);
  }

  // Handle Percentage UOM specially - compare value directly against thresholds
  // For % UOM, the achieved value is already normalized; do NOT divide by target
  if (uom === '%' || uom?.toLowerCase() === 'percentage') {
    return calculatePercentageRating(achievedValue, thresholds, criteria, weightage);
  }

  // Handle qualitative UOM types (binary, tiered)
  if (uomType === 'binary' || uomType === 'tiered') {
    const stringValue = typeof achievedValue === 'string' ? achievedValue : null;
    const options = uomType === 'binary' ? BINARY_OPTIONS : qualitativeOptions || [];

    // Try label matching first (for proper qualitative values like "Yes"/"No")
    if (stringValue) {
      const selected = options.find(opt => opt.label === stringValue);
      if (selected) {
        const rating = selected.rating;
        const ratingLevel = scoreToRatingLevel(rating);
        const percentage = (rating / 5) * 100;
        const weightedScore = weightage * rating;
        const achievedWeight = rating / 5;
        return { rating, ratingLevel, weightedScore, percentage, achievedWeight };
      }
    }

    // Reverse-map: numeric achieved value → option by rating
    // Fixes: DB stores numeric 5 for "Yes", but label match fails on "5"
    const numericVal = typeof achievedValue === 'number'
      ? achievedValue
      : parseFloat(String(achievedValue ?? ''));
    if (!isNaN(numericVal)) {
      const matchedOption = options.find(opt => opt.rating === numericVal);
      if (matchedOption) {
        const rating = matchedOption.rating;
        const ratingLevel = scoreToRatingLevel(rating);
        const percentage = (rating / 5) * 100;
        const weightedScore = weightage * rating;
        const achievedWeight = rating / 5;
        return { rating, ratingLevel, weightedScore, percentage, achievedWeight };
      }
    }

    // FALLBACK: If no label or rating match (numeric value or missing qualitative options),
    // treat as numeric and use threshold-based calculation
    const numVal = typeof achievedValue === 'number'
      ? achievedValue
      : parseFloat(String(achievedValue ?? ''));
    if (!isNaN(numVal)) {
      const hasThresholds = [thresholds.r5, thresholds.r4, thresholds.r3, thresholds.r2, thresholds.r1]
        .some(t => t !== null && t !== undefined && t !== '');
      if (hasThresholds) {
        return calculateAbsoluteRating(numVal, thresholds, criteria, weightage, target || 0);
      }
      // No thresholds but target exists — use ratio-based calculation
      if (target && target > 0) {
        const isLowerBetter = criteria?.toLowerCase().includes('lower');
        const achievedWeight = isLowerBetter
          ? (numVal !== 0 ? target / numVal : 0)
          : target !== 0 ? numVal / target : 0;
        // Simple ratio-to-rating mapping
        let rating = 0;
        if (achievedWeight >= 1.0) rating = 5;
        else if (achievedWeight >= 0.9) rating = 4;
        else if (achievedWeight >= 0.8) rating = 3;
        else if (achievedWeight >= 0.6) rating = 2;
        else if (achievedWeight >= 0.4) rating = 1;
        return {
          rating,
          ratingLevel: ratingToLevel(rating),
          weightedScore: weightage * rating,
          percentage: achievedWeight * 100,
          achievedWeight,
        };
      }
    }

    // Final fallback: rating 0
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Numeric UOM handling
  // If no achieved value, return zero rating
  if (achievedValue === null || achievedValue === undefined || achievedValue === '') {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Convert string to number for numeric UOM
  const numericValue = typeof achievedValue === 'string' ? parseFloat(achievedValue) : achievedValue;
  if (isNaN(numericValue)) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  const achieved = parseThreshold(numericValue, false) ?? 0;
  const targetVal = parseThreshold(target, false) ?? 0;

  // Route based on threshold_mode
  if (thresholdMode === 'absolute') {
    // ABSOLUTE MODE: Direct value comparison (like % and Date UOMs)
    // Thresholds are actual values, not ratios/percentages
    return calculateAbsoluteRating(achieved, thresholds, criteria, weightage, targetVal);
  }

  // RATIO MODE (Legacy): Compare achieved/target ratio against thresholds
  // When target is 0, thresholds are absolute numbers (not percentages)
  // When target is not 0, thresholds are percentages/ratios
  const thresholdsAsRatio = targetVal !== 0;
  
  // Parse all thresholds based on whether they should be treated as ratios
  const r5 = parseThreshold(thresholds.r5, thresholdsAsRatio);
  const r4 = parseThreshold(thresholds.r4, thresholdsAsRatio);
  const r3 = parseThreshold(thresholds.r3, thresholdsAsRatio);
  const r2 = parseThreshold(thresholds.r2, thresholdsAsRatio);
  const r1 = parseThreshold(thresholds.r1, thresholdsAsRatio);

  let rating = 0;
  
  const isLowerBetter = criteria?.toLowerCase().includes('lower');

  // Calculate achievedWeight ratio based on criteria
  let achievedWeight = 0;
  if (targetVal === 0) {
    // Special case: when target is 0, we compare achieved directly against thresholds
    // In this case, lower achieved = higher rating (used for "Lower is Better" scenarios)
    if (r5 !== null && achieved <= r5) rating = 5;
    else if (r4 !== null && achieved <= r4) rating = 4;
    else if (r3 !== null && achieved <= r3) rating = 3;
    else if (r2 !== null && achieved <= r2) rating = 2;
    else if (r1 !== null && achieved <= r1) rating = 1;
    else rating = 0;
  } else {
    // Calculate ratio based on criteria
    if (isLowerBetter) {
      // Lower is Better: ratio = target / achieved (lower achieved = higher ratio)
      achievedWeight = achieved !== 0 ? targetVal / achieved : 0;
    } else {
      // Higher is Better: ratio = achieved / target (higher achieved = higher ratio)
      achievedWeight = targetVal !== 0 ? achieved / targetVal : 0;
    }

    // Compare ratio against thresholds (higher ratio = higher rating)
    if (r5 !== null && achievedWeight >= r5) rating = 5;
    else if (r4 !== null && achievedWeight >= r4) rating = 4;
    else if (r3 !== null && achievedWeight >= r3) rating = 3;
    else if (r2 !== null && achievedWeight >= r2) rating = 2;
    else if (r1 !== null && achievedWeight >= r1) rating = 1;
    else rating = 0;
  }

  // Calculate percentage (achievedWeight * 100)
  const percentage = achievedWeight * 100;

  // Calculate weighted score: weightage * rating
  const weightedScore = (weightage * rating);

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore,
    percentage,
    achievedWeight,
  };
}

/**
 * Calculate rating using ABSOLUTE threshold mode (direct value comparison)
 * 
 * This is the new primary scoring logic - thresholds are actual values, not percentages.
 * - Higher is Better: achieved >= threshold → rating
 * - Lower is Better: achieved <= threshold → rating
 * 
 * Examples:
 * - R5 = 100, achieved = 105, criteria = "Higher is Better" → Rating 5 (105 >= 100)
 * - R5 = 90, achieved = 88, criteria = "Lower is Better" → Rating 5 (88 <= 90)
 */
function calculateAbsoluteRating(
  achieved: number,
  thresholds: RatingThresholds,
  criteria: string,
  weightage: number,
  targetVal: number = 0
): RatingResult {
  // Parse thresholds as absolute values (not ratios)
  const r5 = parseThreshold(thresholds.r5, false);
  const r4 = parseThreshold(thresholds.r4, false);
  const r3 = parseThreshold(thresholds.r3, false);
  const r2 = parseThreshold(thresholds.r2, false);
  const r1 = parseThreshold(thresholds.r1, false);
  const r0 = parseThreshold(thresholds.r0, false);

  warnIfNonMonotonic({ r5, r4, r3, r2, r1, r0 }, criteria, 'calculateAbsoluteRating');

  const isLowerBetter = criteria?.toLowerCase().includes('lower');
  let rating = 0;

  if (isLowerBetter) {
    // Lower is Better: lower achieved value = higher rating
    // Thresholds should be in ascending order (R5 = lowest acceptable, R1 = highest)
    if (r5 !== null && achieved <= r5) rating = 5;
    else if (r4 !== null && achieved <= r4) rating = 4;
    else if (r3 !== null && achieved <= r3) rating = 3;
    else if (r2 !== null && achieved <= r2) rating = 2;
    else if (r1 !== null && achieved <= r1) rating = 1;
    else if (r0 !== null && achieved > r0) rating = 0;
  } else {
    // Higher is Better: higher achieved value = higher rating
    // Thresholds should be in descending order (R5 = highest, R1 = lowest acceptable)
    if (r5 !== null && achieved >= r5) rating = 5;
    else if (r4 !== null && achieved >= r4) rating = 4;
    else if (r3 !== null && achieved >= r3) rating = 3;
    else if (r2 !== null && achieved >= r2) rating = 2;
    else if (r1 !== null && achieved >= r1) rating = 1;
    else if (r0 !== null && achieved < r0) rating = 0;
  }

  // Calculate percentage for display (achieved/target * 100) if target exists
  const percentage = targetVal !== 0 ? (achieved / targetVal) * 100 : 0;
  const achievedWeight = targetVal !== 0 ? achieved / targetVal : 0;

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore: weightage * rating,
    percentage,
    achievedWeight,
  };
}

/**
 * Calculate rating for Date UOM KPIs
 * 
 * For Date UOM, the achieved value is a day-of-month (1-31).
 * Thresholds (R5-R1) are treated as absolute day values.
 * Logic: Earlier date (lower day number) = Higher rating (Lower is Better)
 * 
 * Example:
 * - R5 = 5 (by 5th day = Outstanding)
 * - R4 = 10 (by 10th day = Exceeds)
 * - R3 = 15 (by 15th day = Meets)
 * - etc.
 */
function calculateDateRating(
  achievedValue: number | string | null | undefined,
  thresholds: RatingThresholds,
  weightage: number
): RatingResult {
  // Parse achieved value as day-of-month
  if (achievedValue === null || achievedValue === undefined || achievedValue === '') {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  const achieved = typeof achievedValue === 'number' 
    ? achievedValue 
    : parseFloat(String(achievedValue));
    
  if (isNaN(achieved) || achieved < 0 || achieved > 31) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Parse thresholds as absolute day values (not ratios/percentages)
  const r5 = parseThreshold(thresholds.r5, false);
  const r4 = parseThreshold(thresholds.r4, false);
  const r3 = parseThreshold(thresholds.r3, false);
  const r2 = parseThreshold(thresholds.r2, false);
  const r1 = parseThreshold(thresholds.r1, false);

  // Lower is Better for dates - earlier day = higher rating
  let rating = 0;
  if (r5 !== null && achieved <= r5) rating = 5;
  else if (r4 !== null && achieved <= r4) rating = 4;
  else if (r3 !== null && achieved <= r3) rating = 3;
  else if (r2 !== null && achieved <= r2) rating = 2;
  else if (r1 !== null && achieved <= r1) rating = 1;

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore: weightage * rating,
    percentage: 0,  // Not applicable for dates
    achievedWeight: 0,
  };
}

/**
 * Calculate rating for Percentage (%) UOM KPIs
 * 
 * For % UOM, the achieved value is already a normalized percentage.
 * Compare directly against thresholds WITHOUT dividing by target.
 * 
 * Lower is Better: lower achieved value = higher rating (e.g., error rate, cost variance)
 * Higher is Better: higher achieved value = higher rating (e.g., success rate, completion rate)
 * 
 * Example (Lower is Better):
 * - R5 = 99%  → achieved ≤ 99% = Rating 5
 * - R4 = 99.5% → achieved ≤ 99.5% = Rating 4
 * - R3 = 100% → achieved ≤ 100% = Rating 3
 * - etc.
 * 
 * Example (Higher is Better):
 * - R5 = 101% → achieved ≥ 101% = Rating 5
 * - R4 = 100.5% → achieved ≥ 100.5% = Rating 4
 * - R3 = 100% → achieved ≥ 100% = Rating 3
 * - etc.
 */
function calculatePercentageRating(
  achievedValue: number | string | null | undefined,
  thresholds: RatingThresholds,
  criteria: string,
  weightage: number
): RatingResult {
  // Parse achieved value
  if (achievedValue === null || achievedValue === undefined || achievedValue === '') {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  const achieved = typeof achievedValue === 'number' 
    ? achievedValue 
    : parseFloat(String(achievedValue));
    
  if (isNaN(achieved)) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Parse thresholds as absolute values (not ratios)
  const r5 = parseThreshold(thresholds.r5, false);
  const r4 = parseThreshold(thresholds.r4, false);
  const r3 = parseThreshold(thresholds.r3, false);
  const r2 = parseThreshold(thresholds.r2, false);
  const r1 = parseThreshold(thresholds.r1, false);
  const r0 = parseThreshold(thresholds.r0, false);

  warnIfNonMonotonic({ r5, r4, r3, r2, r1, r0 }, criteria, 'calculatePercentageRating');

  const isLowerBetter = criteria?.toLowerCase().includes('lower');
  let rating = 0;

  if (isLowerBetter) {
    // Lower is Better: lower value = higher rating
    // Example: Error rate - 99% is better than 101%
    if (r5 !== null && achieved <= r5) rating = 5;
    else if (r4 !== null && achieved <= r4) rating = 4;
    else if (r3 !== null && achieved <= r3) rating = 3;
    else if (r2 !== null && achieved <= r2) rating = 2;
    else if (r1 !== null && achieved <= r1) rating = 1;
    else if (r0 !== null && achieved > r0) rating = 0;
  } else {
    // Higher is Better: higher value = higher rating
    // Example: Success rate - 101% is better than 99%
    if (r5 !== null && achieved >= r5) rating = 5;
    else if (r4 !== null && achieved >= r4) rating = 4;
    else if (r3 !== null && achieved >= r3) rating = 3;
    else if (r2 !== null && achieved >= r2) rating = 2;
    else if (r1 !== null && achieved >= r1) rating = 1;
    else if (r0 !== null && achieved < r0) rating = 0;
  }

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore: weightage * rating,
    percentage: 0,  // Not applicable - value IS a percentage
    achievedWeight: 0,  // Not applicable - no ratio calculation
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
 * Get status flow for review process (static default)
 */
export const REVIEW_STATUS_FLOW: Record<string, { next: string | null; label: string }> = {
  'kra_set': { next: 'self_review', label: 'KRA Set' },
  'self_review': { next: 'manager_check', label: 'Self Review' },
  'manager_check': { next: 'audit', label: 'Manager Review' },
  'audit': { next: 'management_review', label: 'Audit Review' },
  'admin_review': { next: 'approved', label: 'Admin Review' },
  'management_review': { next: 'approved', label: 'Management Review' },
  'approved': { next: null, label: 'Approved' },
};

export function getNextStatus(currentStatus: string): string | null {
  return REVIEW_STATUS_FLOW[currentStatus]?.next || null;
}

export function getStatusLabel(status: string): string {
  return REVIEW_STATUS_FLOW[status]?.label || status;
}

/**
 * Get next status based on employee's dynamic workflow
 */
export function getNextStatusForWorkflow(currentStatus: string, workflowStages: string[]): string | null {
  const currentIndex = workflowStages.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex >= workflowStages.length - 1) {
    return null;
  }
  return workflowStages[currentIndex + 1];
}

/**
 * Check if a stage is part of the workflow
 */
export function isStageInWorkflow(stage: string, workflowStages: string[]): boolean {
  return workflowStages.includes(stage);
}

/**
 * Check if a value appears unreasonably out of range relative to thresholds and target.
 * Returns a non-blocking warning message if the value looks suspicious.
 * 
 * Rules:
 * - For % UOM: warn if value > 2x the highest threshold (e.g. R5=20 → warn if >40)
 * - For any UOM: warn if value > 10x the target
 */
export function isValueOutOfRange(
  value: number,
  target: number | null,
  thresholds: RatingThresholds,
  uom: string | null
): { outOfRange: boolean; message: string | null } {
  if (value === 0) return { outOfRange: false, message: null };

  // For % UOM: warn if value > 2x the highest threshold
  if (uom === '%' || uom?.toLowerCase() === 'percentage') {
    const thresholdValues = [
      parseThreshold(thresholds.r5, false),
      parseThreshold(thresholds.r4, false),
      parseThreshold(thresholds.r3, false),
      parseThreshold(thresholds.r2, false),
      parseThreshold(thresholds.r1, false),
    ].filter((v): v is number => v !== null);

    if (thresholdValues.length > 0) {
      const maxThreshold = Math.max(...thresholdValues);
      if (maxThreshold > 0 && value > maxThreshold * 2) {
        return {
          outOfRange: true,
          message: `Value ${value.toLocaleString()} is significantly higher than the highest threshold (${maxThreshold}). Please verify this is the correct percentage value.`,
        };
      }
    }
  }

  // For any UOM: warn if value > 10x target
  if (target && target > 0 && value > target * 10) {
    return {
      outOfRange: true,
      message: `Value ${value.toLocaleString()} is more than 10× the target (${target}). Please verify.`,
    };
  }

  return { outOfRange: false, message: null };
}

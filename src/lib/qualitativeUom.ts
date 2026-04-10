// Types and utilities for qualitative Unit of Measure support

export type UomType = 'numeric' | 'binary' | 'tiered';

export interface QualitativeOption {
  label: string;      // e.g., "Partial"
  rating: number;     // 0-5, admin's choice
  definition: string; // KPI-specific meaning
}

// Predefined tiered templates for quick setup
export const TIERED_TEMPLATES: Record<string, QualitativeOption[]> = {
  'yes_no': [
    { label: 'Yes', rating: 5, definition: 'Requirement fully met' },
    { label: 'No', rating: 0, definition: 'Requirement not met' },
  ],
  'pass_fail': [
    { label: 'Pass', rating: 5, definition: 'Successfully passed' },
    { label: 'Fail', rating: 0, definition: 'Did not pass' },
  ],
  'compliance_3': [
    { label: 'Compliant', rating: 5, definition: 'Fully compliant with all requirements' },
    { label: 'Partial', rating: 3, definition: 'Partially compliant with documented gaps' },
    { label: 'Non-Compliant', rating: 0, definition: 'Failed to meet compliance requirements' },
  ],
  'compliance_4': [
    { label: 'Full', rating: 5, definition: 'Fully compliant' },
    { label: 'Substantial', rating: 4, definition: 'Substantially compliant with minor gaps' },
    { label: 'Partial', rating: 2, definition: 'Partially compliant with significant gaps' },
    { label: 'None', rating: 0, definition: 'Non-compliant' },
  ],
  'achievement': [
    { label: 'Achieved', rating: 5, definition: 'Target fully achieved' },
    { label: 'Partial', rating: 3, definition: 'Target partially achieved' },
    { label: 'Not Achieved', rating: 0, definition: 'Target not achieved' },
  ],
  'risk_rating': [
    { label: 'Low', rating: 5, definition: 'Low risk - within acceptable limits' },
    { label: 'Medium', rating: 3, definition: 'Medium risk - requires monitoring' },
    { label: 'High', rating: 0, definition: 'High risk - immediate action required' },
  ],
  'timeliness': [
    { label: 'On-time', rating: 5, definition: 'Delivered on or before deadline' },
    { label: 'Late', rating: 2, definition: 'Delivered after deadline' },
    { label: 'Not Submitted', rating: 0, definition: 'Not delivered' },
  ],
};

export const TEMPLATE_LABELS: Record<string, string> = {
  'yes_no': 'Yes / No',
  'pass_fail': 'Pass / Fail',
  'compliance_3': 'Compliance (3-tier)',
  'compliance_4': 'Compliance (4-tier)',
  'achievement': 'Achievement',
  'risk_rating': 'Risk Rating',
  'timeliness': 'Timeliness',
};

// Binary UOM fixed mapping
export const BINARY_OPTIONS: QualitativeOption[] = [
  { label: 'Yes', rating: 5, definition: 'Yes' },
  { label: 'No', rating: 0, definition: 'No' },
];

// Inverted binary mapping (for safety KPIs like LTI where No = good)
export const BINARY_OPTIONS_INVERTED: QualitativeOption[] = [
  { label: 'Yes', rating: 0, definition: 'Yes' },
  { label: 'No', rating: 5, definition: 'No' },
];

// Returns stored qualitative_options for binary KPIs, or default BINARY_OPTIONS
export function getBinaryOptions(qualitativeOptions: QualitativeOption[] | null | undefined): QualitativeOption[] {
  if (qualitativeOptions && qualitativeOptions.length >= 2) {
    return qualitativeOptions;
  }
  return BINARY_OPTIONS;
}

// Check if binary options are inverted (No=5)
export function isBinaryInverted(qualitativeOptions: QualitativeOption[] | null | undefined): boolean {
  if (!qualitativeOptions || qualitativeOptions.length < 2) return false;
  const noOption = qualitativeOptions.find(o => o.label === 'No');
  return noOption?.rating === 5;
}

// Rating score labels — aligned with canonical scale
export const RATING_LABELS: Record<number, string> = {
  5: 'Outstanding (R5)',
  4: 'Exceeds Expectations (R4)',
  3: 'Meets Expectations (R3)',
  2: 'Needs Improvement (R2)',
  1: 'Below Expectations (R1)',
  0: 'Not Achieved (R0)',
};

// Get rating level from score for qualitative
export function scoreToRatingLevel(score: number): 'blue' | 'green' | 'yellow' | 'red' {
  if (score >= 5) return 'blue';
  if (score >= 4) return 'green';
  if (score >= 3) return 'yellow';
  return 'red';
}

// Calculate rating for qualitative UOM
export function calculateQualitativeRating(
  achievedValue: string | null,
  uomType: UomType,
  qualitativeOptions: QualitativeOption[] | null,
  weightage: number = 0
): { rating: number; ratingLevel: 'blue' | 'green' | 'yellow' | 'red'; weightedScore: number } | null {
  if (!achievedValue) return null;

  let options: QualitativeOption[] = [];

  if (uomType === 'binary') {
    options = getBinaryOptions(qualitativeOptions);
  } else if (uomType === 'tiered' && qualitativeOptions) {
    options = qualitativeOptions;
  } else {
    return null;
  }

  const selected = options.find(opt => opt.label === achievedValue);
  if (!selected) return null;

  const rating = selected.rating;
  const ratingLevel = scoreToRatingLevel(rating);
  const weightedScore = (rating / 5) * weightage;

  return { rating, ratingLevel, weightedScore };
}

// Get the "target" display label for binary/tiered KPIs (the Rating-5 option label)
export function getQualitativeTargetLabel(
  uomType: UomType | null,
  qualitativeOptions: QualitativeOption[] | null | undefined
): string | null {
  if (uomType !== 'binary' && uomType !== 'tiered') return null;
  const options = qualitativeOptions?.length
    ? qualitativeOptions
    : (uomType === 'binary' ? BINARY_OPTIONS : []);
  if (options.length === 0) return null;
  // Find the option with the highest rating (target = best outcome)
  const best = options.reduce((a, b) => (b.rating > a.rating ? b : a), options[0]);
  return best.label;
}

// Resolve a numeric achieved_value back to the qualitative label
export function getQualitativeAchievedLabel(
  achievedValue: number | string | null | undefined,
  uomType: UomType | null,
  qualitativeOptions: QualitativeOption[] | null | undefined
): string | null {
  if (achievedValue === null || achievedValue === undefined) return null;
  if (uomType !== 'binary' && uomType !== 'tiered') return null;
  const options = qualitativeOptions?.length
    ? qualitativeOptions
    : (uomType === 'binary' ? BINARY_OPTIONS : []);
  if (options.length === 0) return null;

  // If achievedValue is already a label string, return it directly
  if (typeof achievedValue === 'string') {
    const byLabel = options.find(o => o.label === achievedValue);
    if (byLabel) return byLabel.label;
  }

  // Numeric — match by rating
  const numVal = typeof achievedValue === 'string' ? parseFloat(achievedValue) : achievedValue;
  if (isNaN(numVal)) return String(achievedValue);
  const match = options.find(o => o.rating === numVal);
  return match ? match.label : String(achievedValue);
}

// Validate qualitative options
export function validateQualitativeOptions(options: QualitativeOption[]): string | null {
  if (options.length < 2) {
    return 'At least 2 options are required';
  }

  for (const opt of options) {
    if (!opt.label.trim()) {
      return 'All options must have a label';
    }
    if (opt.rating < 0 || opt.rating > 5) {
      return 'Ratings must be between 0 and 5';
    }
    if (!opt.definition.trim()) {
      return 'All options must have a definition';
    }
  }

  const labels = options.map(o => o.label.toLowerCase());
  if (new Set(labels).size !== labels.length) {
    return 'Option labels must be unique';
  }

  return null;
}

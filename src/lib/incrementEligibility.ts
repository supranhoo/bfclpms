/**
 * Phase 19.5 — Increment Eligibility Evaluator
 *
 * Pure function used by the (future) Increment Calculation Engine to decide
 * whether an employee qualifies for an increment in a given assessment year.
 *
 * The evaluator is intentionally generic: it does not know about specific
 * criterion keys. The caller assembles `metrics` by criterion_key (e.g.
 * { absent_days: 12, lwp_days: 0, ... }) from whatever upstream sources are
 * relevant for that scope.
 */

export type ComparisonOperator = '>=' | '<=' | '>' | '<' | '=';

export interface EligibilityCriterion {
  id: string;
  criterion_key: string;
  criterion_name: string;
  comparison_operator: ComparisonOperator;
  threshold_value: number;
  unit_label?: string | null;
  is_active: boolean;
  effective_date: string; // ISO yyyy-mm-dd
}

export interface FailedCriterion {
  criterion_id: string;
  criterion_name: string;
  operator: ComparisonOperator;
  threshold: number;
  actual: number;
  unit_label?: string | null;
}

export interface EvaluationResult {
  eligible: boolean;
  failed: FailedCriterion[];
  evaluatedAt: string; // ISO date used as Date of Validation
}

function breaches(actual: number, op: ComparisonOperator, threshold: number): boolean {
  switch (op) {
    case '>=':
      return actual >= threshold;
    case '<=':
      return actual <= threshold;
    case '>':
      return actual > threshold;
    case '<':
      return actual < threshold;
    case '=':
      return actual === threshold;
    default:
      return false;
  }
}

export function evaluateIncrementEligibility(
  metrics: Record<string, number | null | undefined>,
  criteria: EligibilityCriterion[],
  validationDate: Date = new Date(),
): EvaluationResult {
  const validationISO = validationDate.toISOString().slice(0, 10);
  const failed: FailedCriterion[] = [];

  for (const c of criteria) {
    if (!c.is_active) continue;
    if (c.effective_date && c.effective_date > validationISO) continue;

    const actual = metrics[c.criterion_key];
    if (actual === undefined || actual === null) continue;

    if (breaches(actual, c.comparison_operator, c.threshold_value)) {
      failed.push({
        criterion_id: c.id,
        criterion_name: c.criterion_name,
        operator: c.comparison_operator,
        threshold: c.threshold_value,
        actual,
        unit_label: c.unit_label ?? null,
      });
    }
  }

  return {
    eligible: failed.length === 0,
    failed,
    evaluatedAt: validationISO,
  };
}

/**
 * Default criterion seeds used when a new config is created from scratch.
 * These are SEEDS only — admins can edit, delete, or add criteria freely;
 * nothing in runtime logic is hardcoded against these keys.
 */
export const DEFAULT_ELIGIBILITY_SEEDS: Array<
  Pick<
    EligibilityCriterion,
    'criterion_key' | 'criterion_name' | 'comparison_operator' | 'threshold_value' | 'unit_label'
  > & { description: string; sort_order: number }
> = [
  {
    criterion_key: 'absent_days',
    criterion_name: 'Absent Days',
    description:
      "If employee's absent days are greater than or equal to the threshold, increment eligibility becomes zero.",
    comparison_operator: '>=',
    threshold_value: 10,
    unit_label: 'days',
    sort_order: 1,
  },
  {
    criterion_key: 'lwp_days',
    criterion_name: 'Leave Without Pay (LWP)',
    description:
      "If employee's LWP days are greater than or equal to the threshold, increment eligibility becomes zero.",
    comparison_operator: '>=',
    threshold_value: 5,
    unit_label: 'days',
    sort_order: 2,
  },
  {
    criterion_key: 'disciplinary_actions',
    criterion_name: 'Disciplinary Actions',
    description:
      'Count of warning letters, suspensions, charge sheets, final warnings, etc. in the assessment year.',
    comparison_operator: '>=',
    threshold_value: 2,
    unit_label: 'count',
    sort_order: 3,
  },
  {
    criterion_key: 'training_compliance',
    criterion_name: 'Training Compliance',
    description:
      'If completed training days/programs are less than or equal to the threshold, eligibility becomes zero.',
    comparison_operator: '<=',
    threshold_value: 3,
    unit_label: 'programs',
    sort_order: 4,
  },
];
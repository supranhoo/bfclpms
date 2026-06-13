import type { EligibilityCriterion, EligibilityOperator } from '@/types/annualReview';

export interface EligibilityResult {
  passed: boolean;
  failures: { criterion: EligibilityCriterion; actual: unknown }[];
}

function coerce(actual: unknown, type: EligibilityCriterion['type']): unknown {
  if (actual === null || actual === undefined) return actual;
  if (type === 'number') return typeof actual === 'number' ? actual : Number(actual);
  if (type === 'boolean') return typeof actual === 'boolean' ? actual : String(actual).toLowerCase() === 'true' || actual === 1 || actual === '1';
  return String(actual);
}

/**
 * Evaluate a single operator. Returns false (not just throwing) when actual is null/undefined,
 * since "not provided" means the eligibility check has not been satisfied.
 */
export function evaluate(operator: EligibilityOperator, actual: unknown, expected: unknown): boolean {
  if (actual === null || actual === undefined) return false;
  switch (operator) {
    case 'equals':     return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'gt':         return Number(actual) >  Number(expected);
    case 'gte':        return Number(actual) >= Number(expected);
    case 'lt':         return Number(actual) <  Number(expected);
    case 'lte':        return Number(actual) <= Number(expected);
    default:           return false;
  }
}

/** Evaluate every configured criterion against the instance's eligibility_inputs map. */
export function evaluateEligibility(
  criteria: EligibilityCriterion[],
  inputs: Record<string, unknown>,
): EligibilityResult {
  const failures: EligibilityResult['failures'] = [];
  for (const c of criteria) {
    const actual = coerce(inputs[c.id] ?? inputs[c.name], c.type);
    if (!evaluate(c.operator, actual, c.expected_value)) {
      failures.push({ criterion: c, actual });
    }
  }
  return { passed: failures.length === 0, failures };
}
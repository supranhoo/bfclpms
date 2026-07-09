import type { EligibilityCriterion } from '@/types/annualReview';

/**
 * Human-readable formatters for eligibility criteria. The evaluator in
 * `lib/annualReview/eligibility.ts` still uses the raw operator + expected
 * value to decide pass/fail — these helpers only shape the strings we render
 * so users never see backend syntax like `gte 6` or `equals false`.
 *
 * See POLICY §AR-ELIGIBILITY-ALWAYS-VISIBLE.
 */

type Translator = (key: string, fallback: string) => string;

const identity: Translator = (_k, f) => f;

function formatBoolean(expected: unknown, negated: boolean, t: Translator): string {
  const isTrue = expected === true || expected === 'true' || expected === 1 || expected === '1';
  if (negated) {
    return isTrue
      ? t('eligibility.expected.bool_not_true', 'Not Yes')
      : t('eligibility.expected.bool_not_false', 'Not No');
  }
  return isTrue
    ? t('eligibility.expected.bool_true', 'Yes')
    : t('eligibility.expected.bool_false', 'No');
}

/** Turn (operator, expected_value, type) into a plain-English phrase. */
export function formatExpected(c: EligibilityCriterion, t: Translator = identity): string {
  const v = String(c.expected_value);
  if (c.type === 'boolean') {
    if (c.operator === 'equals')     return formatBoolean(c.expected_value, false, t);
    if (c.operator === 'not_equals') return formatBoolean(c.expected_value, true, t);
  }
  switch (c.operator) {
    case 'equals':     return t('eligibility.expected.equals',     `= ${v}`).replace('{value}', v);
    case 'not_equals': return t('eligibility.expected.not_equals', `≠ ${v}`).replace('{value}', v);
    case 'gte':        return t('eligibility.expected.gte',        `At least ${v}`).replace('{value}', v);
    case 'gt':         return t('eligibility.expected.gt',         `More than ${v}`).replace('{value}', v);
    case 'lte':        return t('eligibility.expected.lte',        `At most ${v}`).replace('{value}', v);
    case 'lt':         return t('eligibility.expected.lt',         `Less than ${v}`).replace('{value}', v);
    default:           return v;
  }
}

/** Render an actual value in the same language space as `formatExpected`. */
export function formatActual(
  value: unknown,
  type: EligibilityCriterion['type'],
  t: Translator = identity,
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'boolean') {
    const isTrue = value === true || value === 'true' || value === 1 || value === '1';
    return isTrue
      ? t('eligibility.actual.yes', 'Yes')
      : t('eligibility.actual.no', 'No');
  }
  return String(value);
}
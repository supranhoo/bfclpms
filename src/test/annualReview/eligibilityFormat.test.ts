import { describe, it, expect } from 'vitest';
import { formatExpected, formatActual } from '@/lib/annualReview/eligibilityFormat';
import type { EligibilityCriterion } from '@/types/annualReview';

const num = (op: EligibilityCriterion['operator'], v: number | string): EligibilityCriterion =>
  ({ id: 'x', name: 'x', type: 'number', operator: op, expected_value: v });
const bool = (op: EligibilityCriterion['operator'], v: boolean): EligibilityCriterion =>
  ({ id: 'x', name: 'x', type: 'boolean', operator: op, expected_value: v });

describe('eligibilityFormat.formatExpected', () => {
  it('renders numeric operators in plain language', () => {
    expect(formatExpected(num('gte', 6))).toBe('At least 6');
    expect(formatExpected(num('gt', 5))).toBe('More than 5');
    expect(formatExpected(num('lte', 30))).toBe('At most 30');
    expect(formatExpected(num('lt', 1))).toBe('Less than 1');
    expect(formatExpected(num('equals', 100))).toBe('= 100');
    expect(formatExpected(num('not_equals', 0))).toBe('≠ 0');
  });

  it('renders booleans as Yes/No, never true/false', () => {
    expect(formatExpected(bool('equals', false))).toBe('No');
    expect(formatExpected(bool('equals', true))).toBe('Yes');
    expect(formatExpected(bool('not_equals', false))).toBe('Not No');
    expect(formatExpected(bool('not_equals', true))).toBe('Not Yes');
  });

  it('never leaks raw operator enums', () => {
    for (const op of ['gte','gt','lte','lt','equals','not_equals'] as const) {
      const out = formatExpected(num(op, 3));
      expect(out).not.toMatch(/gte|gt |lte|lt |equals|not_equals/);
    }
  });
});

describe('eligibilityFormat.formatActual', () => {
  it('renders booleans as Yes/No', () => {
    expect(formatActual(true, 'boolean')).toBe('Yes');
    expect(formatActual(false, 'boolean')).toBe('No');
    expect(formatActual('true', 'boolean')).toBe('Yes');
  });
  it('passes numbers/strings through', () => {
    expect(formatActual(9, 'number')).toBe('9');
    expect(formatActual(0, 'number')).toBe('0');
    expect(formatActual('hello', 'string')).toBe('hello');
  });
  it('returns em-dash for missing values', () => {
    expect(formatActual(null, 'number')).toBe('—');
    expect(formatActual(undefined, 'boolean')).toBe('—');
    expect(formatActual('', 'string')).toBe('—');
  });
});
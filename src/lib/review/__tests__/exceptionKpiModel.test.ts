/**
 * ADR-317 regression tests — exception KPI classification must never silently
 * penalise a clean scope, nor let an incident pass as clean.
 */
import { describe, expect, it } from 'vitest';
import {
  describeReleaseReadiness, isExceptionReady, isFlaggedValue,
  type ExceptionConfig, type ExceptionSummary,
} from '../exceptionKpiModel';

const summary = (over: Partial<ExceptionSummary> = {}): ExceptionSummary => ({
  entry_mode: 'exception',
  scope_dimension: 'department',
  clean_value: 0,
  direction: 'lower_better',
  total_scopes: 10,
  flagged_scopes: 2,
  clean_scopes: 8,
  blank_scopes: 0,
  employees_flagged: 45,
  flagged: [],
  ...over,
});

describe('isFlaggedValue', () => {
  it('flags anything above the clean value when lower is better', () => {
    expect(isFlaggedValue(1, 0, 'lower_better')).toBe(true);
    expect(isFlaggedValue(0, 0, 'lower_better')).toBe(false);
    expect(isFlaggedValue(-1, 0, 'lower_better')).toBe(false);
  });

  it('flags anything below the clean value when higher is better', () => {
    expect(isFlaggedValue(99, 100, 'higher_better')).toBe(true);
    expect(isFlaggedValue(100, 100, 'higher_better')).toBe(false);
  });

  it('treats blank and non-numeric values as not flagged', () => {
    expect(isFlaggedValue(null, 0, 'lower_better')).toBe(false);
    expect(isFlaggedValue(undefined, 0, 'lower_better')).toBe(false);
    expect(isFlaggedValue(Number.NaN, 0, 'lower_better')).toBe(false);
  });

  it('honours a non-zero clean baseline', () => {
    expect(isFlaggedValue(2, 2, 'lower_better')).toBe(false);
    expect(isFlaggedValue(3, 2, 'lower_better')).toBe(true);
  });
});

describe('isExceptionReady', () => {
  const base: ExceptionConfig = {
    entry_mode: 'exception',
    scope_dimension: 'department',
    clean_value: 0,
    exception_direction: 'lower_better',
  };

  it('accepts a fully configured exception table', () => {
    expect(isExceptionReady(base)).toBe(true);
  });

  it('rejects row-entry tables', () => {
    expect(isExceptionReady({ ...base, entry_mode: 'row_entry' })).toBe(false);
  });

  it('rejects a missing scope or clean value', () => {
    expect(isExceptionReady({ ...base, scope_dimension: null })).toBe(false);
    expect(isExceptionReady({ ...base, clean_value: null })).toBe(false);
  });

  it('rejects an absent config', () => {
    expect(isExceptionReady(null)).toBe(false);
  });
});

describe('describeReleaseReadiness', () => {
  it('asks for a roster when nothing is seeded', () => {
    expect(describeReleaseReadiness(summary({ total_scopes: 0 }))).toMatch(/roster/i);
  });

  it('warns about blank scopes before release', () => {
    expect(describeReleaseReadiness(summary({ blank_scopes: 3 }))).toMatch(/3 department/);
  });

  it('confirms readiness when every scope is filled', () => {
    expect(describeReleaseReadiness(summary())).toMatch(/ready to release/i);
  });

  it('handles a missing summary', () => {
    expect(describeReleaseReadiness(null)).toMatch(/Loading/i);
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_SCORING_VALUES, scoringChangeSet, scoringSignature } from './employeeScoringProfile';

describe('employee scoring profiles', () => {
  it('distinguishes the same target with different scoring tests', () => {
    const a = { ...EMPTY_SCORING_VALUES, target_value: 10, kpi_scoring_logic: '5 when actual >= 10' };
    const b = { ...a, kpi_scoring_logic: '5 when actual >= 12' };
    expect(scoringSignature(a)).not.toBe(scoringSignature(b));
  });

  it('emits only changed scoring fields', () => {
    const current = { ...EMPTY_SCORING_VALUES, target_value: 10, weightage: 20 };
    expect(scoringChangeSet(current, { target_value: 12, weightage: 20 }))
      .toEqual({ target_value: '12' });
  });

  it('clears a scoring test without touching the target', () => {
    const current = { ...EMPTY_SCORING_VALUES, target_value: 10, kpi_scoring_logic: 'old test' };
    expect(scoringChangeSet(current, { kpi_scoring_logic: null }))
      .toEqual({ kpi_scoring_logic: null });
  });
});
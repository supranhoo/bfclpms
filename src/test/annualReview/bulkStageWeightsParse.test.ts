import { describe, it, expect } from 'vitest';
import { isValidStageWeights, type StageWeights } from '@/lib/annualReview/finalScore';

/**
 * Lightweight unit coverage for the validation rules consumed by
 * BulkStageWeightsAssignmentDialog. The component itself parses XLSX rows
 * into the same StageWeights shape, then defers to isValidStageWeights.
 */
describe('Bulk stage weights — row validation rules', () => {
  it('accepts a 20/50/30 blend', () => {
    const w: StageWeights = { self: 20, manager: 50, bu_head: 30 };
    expect(isValidStageWeights(w)).toBe(true);
  });

  it('rejects totals != 100', () => {
    expect(isValidStageWeights({ self: 20, manager: 50 })).toBe(false);
    expect(isValidStageWeights({ self: 60, manager: 60 })).toBe(false);
  });

  it('rejects negative values', () => {
    expect(isValidStageWeights({ self: 110, manager: -10 })).toBe(false);
  });

  it('treats zero-value buckets as inactive (excluded from sum)', () => {
    expect(isValidStageWeights({ self: 100, manager: 0 })).toBe(true);
  });

  it('accepts criteria-only legacy blend', () => {
    expect(isValidStageWeights({ criteria: 100 })).toBe(true);
  });

  it('rejects empty / null / undefined', () => {
    expect(isValidStageWeights({})).toBe(false);
    expect(isValidStageWeights(null)).toBe(false);
    expect(isValidStageWeights(undefined)).toBe(false);
  });

  it('tolerates 0.01 rounding drift', () => {
    expect(isValidStageWeights({ self: 33.33, manager: 33.33, bu_head: 33.34 })).toBe(true);
  });
});
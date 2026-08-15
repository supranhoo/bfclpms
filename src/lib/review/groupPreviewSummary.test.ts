import { describe, it, expect } from 'vitest';
import {
  resolveSkipSummary,
  affectedCount,
  previewTruncation,
  skippedTruncation,
  needsTypedConfirmation,
  confirmationSatisfied,
} from './groupPreviewSummary';

describe('groupPreviewSummary (ADR-264)', () => {
  it('prefers the server skip summary over the capped detail list', () => {
    const res = {
      will_skip: 900,
      skip_summary: [{ reason: 'approved', count: 700 }, { reason: 'no_value', count: 200 }],
      skipped_details: [{ reason: 'approved' }],
    };
    expect(resolveSkipSummary(res)).toEqual([
      { reason: 'approved', count: 700 },
      { reason: 'no_value', count: 200 },
    ]);
  });

  it('falls back to counting details when no summary is returned', () => {
    const res = { skipped_details: [{ reason: 'a' }, { reason: 'b' }, { reason: 'a' }] };
    expect(resolveSkipSummary(res)).toEqual([
      { reason: 'a', count: 2 },
      { reason: 'b', count: 1 },
    ]);
  });

  it('reports the true affected count for writes and advances', () => {
    expect(affectedCount({ will_write: 1200, preview: [] })).toBe(1200);
    expect(affectedCount({ will_advance: 40 })).toBe(40);
    expect(affectedCount(null)).toBe(0);
  });

  it('flags truncated preview and skipped lists', () => {
    const res = { will_write: 1200, preview: new Array(500).fill({}), will_skip: 30, skipped_details: new Array(30).fill({ reason: 'x' }) };
    expect(previewTruncation(res).truncated).toBe(true);
    expect(previewTruncation(res).message).toContain('500 of 1200');
    expect(skippedTruncation(res).message).toBeNull();
  });

  it('requires a typed confirmation only above the threshold', () => {
    const small = { will_write: 10 };
    const big = { will_write: 2001 };
    expect(needsTypedConfirmation(small)).toBe(false);
    expect(confirmationSatisfied(small, '')).toBe(true);
    expect(needsTypedConfirmation(big)).toBe(true);
    expect(confirmationSatisfied(big, '')).toBe(false);
    expect(confirmationSatisfied(big, ' apply ')).toBe(true);
  });
});
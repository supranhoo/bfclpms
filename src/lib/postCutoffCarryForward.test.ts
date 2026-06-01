import { describe, it, expect } from 'vitest';
import { evaluatePostCutoff } from './postCutoffCarryForward';

const ayStart = new Date('2025-07-01T00:00:00Z');
const ayEnd = new Date('2026-06-30T00:00:00Z');

describe('evaluatePostCutoff', () => {
  it('disabled when cutoff month/day not configured', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2026-01-10T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: null, cutoffDay: null,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(false);
    expect(r.carryForwardMonths).toBe(0);
    expect(r.cutoffDateISO).toBeNull();
  });

  it('disabled when GDOJ missing', () => {
    const r = evaluatePostCutoff({
      gdoj: null, ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(false);
    expect(r.carryForwardMonths).toBe(0);
  });

  it('Example 1: GDOJ 10 Jan 2026, cutoff 31 Dec 2025, carry=Yes → 5 months carried (Feb-Jun)', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2026-01-10T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(true);
    // Whole months from Feb 1 through Jun 30 = Feb, Mar, Apr, May, Jun = 5.
    expect(r.carryForwardMonths).toBe(5);
    expect(r.cutoffDateISO).toBe('2025-12-31');
  });

  it('Example 2: GDOJ 15 Oct 2025, cutoff 31 Dec 2025 → normal calculation (no carry)', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2025-10-15T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(false);
    expect(r.carryForwardMonths).toBe(0);
  });

  it('Example 3: carry=No, post-cutoff joiner → flagged but 0 carry months', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2026-01-10T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: false,
    });
    expect(r.isPostCutoffJoiner).toBe(true);
    expect(r.carryForwardMonths).toBe(0);
    expect(r.reason).toMatch(/Carry-forward disabled/);
  });

  it('GDOJ outside joining AY → rule does not fire', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2024-05-01T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(false);
    expect(r.carryForwardMonths).toBe(0);
  });

  it('Cutoff day clamps to end-of-month (Feb 31 → Feb 28 in 2026)', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2026-03-01T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 2, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.cutoffDateISO).toBe('2026-02-28');
    expect(r.isPostCutoffJoiner).toBe(true);
    // Mar GDOJ → carry Apr-Jun = 3 months.
    expect(r.carryForwardMonths).toBe(3);
  });

  it('GDOJ exactly equal to cutoff → not post-cutoff (on-or-before)', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2025-12-31T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 12, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.isPostCutoffJoiner).toBe(false);
  });

  it('Cutoff in first half of AY (e.g. 31 Aug) — second-half joiner is post-cutoff', () => {
    const r = evaluatePostCutoff({
      gdoj: new Date('2025-09-15T00:00:00Z'),
      ayStart, ayEnd,
      cutoffMonth: 8, cutoffDay: 31,
      carryForwardEnabled: true,
    });
    expect(r.cutoffDateISO).toBe('2025-08-31');
    expect(r.isPostCutoffJoiner).toBe(true);
    // Carry Oct 2025 → Jun 2026 = 9 months.
    expect(r.carryForwardMonths).toBe(9);
  });
});
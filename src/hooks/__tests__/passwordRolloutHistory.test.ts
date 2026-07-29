import { describe, it, expect } from 'vitest';
import { rolloutHistoryRange, performerLabel, ROLLOUT_HISTORY_PAGE_SIZE } from '@/hooks/usePasswordRollout';

describe('password rollout history pagination (ADR-201)', () => {
  it('page size is 10', () => {
    expect(ROLLOUT_HISTORY_PAGE_SIZE).toBe(10);
  });

  it('computes inclusive server ranges', () => {
    expect(rolloutHistoryRange(0)).toEqual({ from: 0, to: 9 });
    expect(rolloutHistoryRange(1)).toEqual({ from: 10, to: 19 });
    expect(rolloutHistoryRange(5)).toEqual({ from: 50, to: 59 });
  });

  it('clamps invalid pages to the first page', () => {
    expect(rolloutHistoryRange(-3)).toEqual({ from: 0, to: 9 });
    expect(rolloutHistoryRange(NaN)).toEqual({ from: 0, to: 9 });
  });
});

describe('performerLabel', () => {
  const map = {
    'u1': { full_name: 'Asha Rani', employee_code: '100001' },
    'u2': { full_name: 'No Code', employee_code: null },
  };

  it('renders name with employee code', () => {
    expect(performerLabel('u1', map)).toBe('Asha Rani (100001)');
  });

  it('falls back to name only when code missing', () => {
    expect(performerLabel('u2', map)).toBe('No Code');
  });

  it('falls back to System for unresolved or null ids', () => {
    expect(performerLabel('unknown', map)).toBe('System');
    expect(performerLabel(null, map)).toBe('System');
  });
});
import { describe, it, expect } from 'vitest';
import { summariseSkipReasons } from './summariseSkipReasons';

describe('summariseSkipReasons', () => {
  it('returns null for empty input', () => {
    expect(summariseSkipReasons([])).toBeNull();
  });

  it('groups a single reason', () => {
    expect(
      summariseSkipReasons([
        { submission_id: 'a', reason: 'self_not_submitted' },
        { submission_id: 'b', reason: 'self_not_submitted' },
      ]),
    ).toBe('2 skipped: self not submitted (2)');
  });

  it('groups two reasons sorted by count desc', () => {
    expect(
      summariseSkipReasons([
        { submission_id: 'a', reason: 'final_locked' },
        { submission_id: 'b', reason: 'self_not_submitted' },
        { submission_id: 'c', reason: 'self_not_submitted' },
      ]),
    ).toBe('3 skipped: self not submitted (2), already final (1)');
  });

  it('falls back to audit log for 3+ reason buckets', () => {
    expect(
      summariseSkipReasons([
        { submission_id: '1', reason: 'final_locked' },
        { submission_id: '2', reason: 'self_not_submitted' },
        { submission_id: '3', reason: 'row_version_conflict' },
      ]),
    ).toBe('3 skipped — see audit log');
  });

  it('surfaces no_prior_score reason for sign-off inheritance failures', () => {
    expect(
      summariseSkipReasons([{ submission_id: 'x', reason: 'no_prior_score' }]),
    ).toBe('1 skipped: no prior score to inherit (1)');
  });

  it('passes unknown reasons through as-is', () => {
    expect(
      summariseSkipReasons([{ submission_id: 'x', reason: 'mystery_reason' }]),
    ).toBe('1 skipped: mystery_reason (1)');
  });
});
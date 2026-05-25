import { describe, it, expect } from 'vitest';
import { summariseSkipReasons, summariseStageWriteOutcome } from './summariseSkipReasons';

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
    ).toBe('3 skipped: self not submitted (2), already finalised (immutable) (1)');
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

  it('labels not_terminal_for_template with the v2.66.13.16 copy', () => {
    expect(
      summariseSkipReasons([
        { submission_id: 'x', reason: 'not_terminal_for_template' },
        { submission_id: 'y', reason: 'not_terminal_for_template' },
      ]),
    ).toBe(
      '2 skipped: workflow has stages after this one — sign-off recorded but cannot approve from here (2)',
    );
  });
});

describe('summariseStageWriteOutcome (POLICY §111.7.c)', () => {
  const skip = (n: number, reason: string) =>
    Array.from({ length: n }, (_, i) => ({ submission_id: `s${i}`, reason }));

  it('all advanced → clean success title', () => {
    const r = summariseStageWriteOutcome({ total: 3, applied: 3, advanced: 3, skipped: [] });
    expect(r.title).toBe('Signed off — 3 advanced');
    expect(r.lines).toEqual(['3 advanced to next stage']);
  });

  it('all skipped final_locked → matches reported screenshot case', () => {
    const r = summariseStageWriteOutcome({
      total: 4,
      applied: 2,
      advanced: 0,
      skipped: skip(2, 'final_locked'),
    });
    // 2 written, 0 advanced, 2 skipped — title reflects no status change.
    expect(r.title).toBe('No status change — 2 written, 2 skipped');
    expect(r.lines).toContain(
      '2 written but stage unchanged (already past this stage or value unchanged)',
    );
    expect(r.lines).toContain('2 skipped: already finalised (immutable) (2)');
  });

  it('mixed: 2 advanced, 2 skipped', () => {
    const r = summariseStageWriteOutcome({
      total: 4,
      applied: 2,
      advanced: 2,
      skipped: skip(2, 'self_not_submitted'),
    });
    expect(r.title).toBe('Partially signed off — 2/4 advanced');
    expect(r.lines).toEqual([
      '2 advanced to next stage',
      '2 skipped: self not submitted (2)',
    ]);
  });

  it('applied > 0, advanced = 0, no skips', () => {
    const r = summariseStageWriteOutcome({ total: 2, applied: 2, advanced: 0, skipped: [] });
    expect(r.title).toBe('No status change — 2 written, 0 skipped');
    expect(r.lines).toEqual([
      '2 written but stage unchanged (already past this stage or value unchanged)',
    ]);
  });

  it('all skipped — nothing written', () => {
    const r = summariseStageWriteOutcome({
      total: 3,
      applied: 0,
      advanced: 0,
      skipped: skip(3, 'final_locked'),
    });
    expect(r.title).toBe('Nothing signed off — all 3 skipped');
    expect(r.lines).toEqual(['3 skipped: already finalised (immutable) (3)']);
  });

  it('reconcile unknown (advanced=null) surfaces caveat', () => {
    const r = summariseStageWriteOutcome({ total: 2, applied: 2, advanced: null, skipped: [] });
    expect(r.title).toBe('Signed off — 2/2 written');
    expect(r.lines).toContain(
      'Stage write recorded — workflow reconcile result unavailable',
    );
  });

  it('unaccounted rows surface defensively', () => {
    const r = summariseStageWriteOutcome({ total: 5, applied: 2, advanced: 2, skipped: [] });
    expect(r.lines).toContain('3 unaccounted (no server response)');
  });
});
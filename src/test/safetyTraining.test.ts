import { describe, expect, it } from 'vitest';
import {
  SAFETY_TRAINING_STATUSES,
  SAFETY_TRAINING_STATUS_LABEL,
  SAFETY_TRAINING_STATUS_TONE,
  canStartAttempt,
  formatDueIn,
  isTrainingTerminal,
  isValidMinReadSeconds,
  isValidPassThreshold,
  type SafetyTrainingStatus,
} from '@/lib/safetyTraining';

/**
 * Phase 3-C — Training & SOP SSOT contract tests.
 *
 * Locks the public surface of the training lifecycle so future changes
 * cannot silently drift from the database enum or the worker UX rules.
 */
describe('safetyTraining SSOT', () => {
  it('status enum matches DB schema (order + members)', () => {
    expect(SAFETY_TRAINING_STATUSES).toEqual([
      'pending',
      'in_progress',
      'passed',
      'failed',
      'overdue',
    ]);
  });

  it('every status has a label and a tone', () => {
    for (const s of SAFETY_TRAINING_STATUSES) {
      expect(SAFETY_TRAINING_STATUS_LABEL[s]).toBeTruthy();
      expect(SAFETY_TRAINING_STATUS_TONE[s]).toBeTruthy();
    }
  });

  it('isTrainingTerminal: only passed & overdue stop the lifecycle', () => {
    const terminal: SafetyTrainingStatus[] = ['passed', 'overdue'];
    for (const s of SAFETY_TRAINING_STATUSES) {
      expect(isTrainingTerminal(s)).toBe(terminal.includes(s));
    }
  });
});

describe('canStartAttempt', () => {
  it('blocks when already passed', () => {
    expect(canStartAttempt('passed', 0, 3)).toBe(false);
  });
  it('blocks when overdue', () => {
    expect(canStartAttempt('overdue', 0, 3)).toBe(false);
  });
  it('blocks when attempts exhausted', () => {
    expect(canStartAttempt('in_progress', 3, 3)).toBe(false);
    expect(canStartAttempt('failed', 3, 3)).toBe(false);
  });
  it('allows pending with attempts remaining', () => {
    expect(canStartAttempt('pending', 0, 3)).toBe(true);
    expect(canStartAttempt('in_progress', 1, 3)).toBe(true);
    expect(canStartAttempt('failed', 2, 3)).toBe(true);
  });
});

describe('formatDueIn', () => {
  const NOW = new Date('2026-04-29T12:00:00Z');
  it('returns dash for null', () => {
    expect(formatDueIn(null, NOW)).toBe('—');
  });
  it('returns "Overdue" when due is in the past', () => {
    expect(formatDueIn('2026-04-29T11:59:00Z', NOW)).toBe('Overdue');
  });
  it('formats days', () => {
    expect(formatDueIn('2026-05-02T12:00:00Z', NOW)).toBe('3d left');
  });
  it('formats hours when < 1 day', () => {
    expect(formatDueIn('2026-04-29T17:00:00Z', NOW)).toBe('5h left');
  });
  it('formats minutes when < 1 hour', () => {
    expect(formatDueIn('2026-04-29T12:30:00Z', NOW)).toBe('30m left');
  });
});

describe('validators', () => {
  it('isValidPassThreshold: integers 1..100', () => {
    expect(isValidPassThreshold(1)).toBe(true);
    expect(isValidPassThreshold(80)).toBe(true);
    expect(isValidPassThreshold(100)).toBe(true);
    expect(isValidPassThreshold(0)).toBe(false);
    expect(isValidPassThreshold(101)).toBe(false);
    expect(isValidPassThreshold(80.5)).toBe(false);
    expect(isValidPassThreshold(Number.NaN)).toBe(false);
  });
  it('isValidMinReadSeconds: 10..7200, integer', () => {
    expect(isValidMinReadSeconds(10)).toBe(true);
    expect(isValidMinReadSeconds(60)).toBe(true);
    expect(isValidMinReadSeconds(7200)).toBe(true);
    expect(isValidMinReadSeconds(9)).toBe(false);
    expect(isValidMinReadSeconds(7201)).toBe(false);
    expect(isValidMinReadSeconds(60.5)).toBe(false);
  });
});
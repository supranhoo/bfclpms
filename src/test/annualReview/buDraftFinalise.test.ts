import { describe, expect, it } from 'vitest';
import {
  resolveTerminalSignoffState,
  terminalSignoffLabel,
  scoredCriteriaCount,
  terminalStage,
  type StageResponseState,
} from '@/lib/annualReview/reopenTerminalSignoff';
import type { AnnualReviewerRole } from '@/types/annualReview';

const stages: AnnualReviewerRole[] = ['self', 'dept_head', 'bu_head'];

const locked = (role: AnnualReviewerRole): StageResponseState => ({
  role,
  isLocked: true,
  submittedAt: '2026-07-25T10:30:14Z',
  criteriaScores: { safety: 4, quality: 4 },
});

/**
 * ADR-185 — POLICY §AR-REOPEN-REQUIRES-TERMINAL-RESUBMIT.
 * Reproduces the 100508 / 101676 case: completed → re-opened → sent back to
 * Dept → Dept re-submitted → terminal BU draft preserved but never re-submitted.
 */
describe('ADR-185 re-opened review needs an explicit terminal re-submit', () => {
  const buDraft: StageResponseState = {
    role: 'bu_head',
    isLocked: false,
    submittedAt: null,
    criteriaScores: { safety: 4, quality: 3, attendance: 4, crit_a: 4 },
  };

  it('reports a scored-but-unlocked terminal draft as awaiting sign-off, not completed', () => {
    const state = resolveTerminalSignoffState({
      overallStatus: 'pending_bu',
      enabledStages: stages,
      responses: [locked('self'), locked('dept_head'), buDraft],
    });
    expect(state).toBe('awaiting_terminal_signoff');
    expect(state).not.toBe('completed');
    expect(terminalSignoffLabel(state)).toBe('Scored draft — awaiting re-submit');
  });

  it('keeps the preserved draft scores so finalising derives from them, never zero', () => {
    expect(scoredCriteriaCount(buDraft.criteriaScores)).toBe(4);
    expect(scoredCriteriaCount({ a: null, b: undefined })).toBe(0);
    expect(scoredCriteriaCount(null)).toBe(0);
  });

  it('treats a locked terminal response as completed', () => {
    expect(
      resolveTerminalSignoffState({
        overallStatus: 'pending_bu',
        enabledStages: stages,
        responses: [locked('self'), locked('dept_head'), locked('bu_head')],
      }),
    ).toBe('completed');
  });

  it('flags an empty terminal draft as awaiting the final reviewer', () => {
    expect(
      resolveTerminalSignoffState({
        overallStatus: 'pending_bu',
        enabledStages: stages,
        responses: [locked('self'), locked('dept_head')],
      }),
    ).toBe('awaiting_terminal_scores');
  });

  it('does not classify instances still pending upstream', () => {
    expect(
      resolveTerminalSignoffState({
        overallStatus: 'pending_dept',
        enabledStages: stages,
        responses: [locked('self')],
      }),
    ).toBe('not_at_terminal_stage');
  });

  it('short-circuits genuinely completed instances and emits no badge', () => {
    const state = resolveTerminalSignoffState({
      overallStatus: 'completed',
      enabledStages: stages,
      responses: [locked('self'), locked('dept_head'), locked('bu_head')],
    });
    expect(state).toBe('completed');
    expect(terminalSignoffLabel(state)).toBeNull();
  });

  it('resolves the terminal stage from enabled_stages order', () => {
    expect(terminalStage(stages)).toBe('bu_head');
    expect(terminalStage(['self', 'manager', 'dept_head', 'bu_head', 'management'])).toBe('management');
    expect(terminalStage([])).toBeNull();
  });
});

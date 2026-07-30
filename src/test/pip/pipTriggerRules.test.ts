/**
 * ADR-207 / POLICY §PIP-TRIGGER-SUGGESTIONS
 * Regression coverage for the objective PIP trigger engine and the §15.7
 * duration / checkpoint-cadence guardrails.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateMonthlyTrigger,
  evaluateAnnualTrigger,
  resolveTriggerReason,
  classifyCandidate,
  validatePipDuration,
  validateMilestoneCadence,
  POLICY_PIP_RATING,
  POLICY_CONSECUTIVE_MONTHS,
} from '@/lib/pip/pipTriggerRules';

const MONTHS = ['2026-04', '2026-05', '2026-06'];
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('monthly trigger (POLICY §15.2)', () => {
  it('qualifies when every month is strictly below the threshold', () => {
    const r = evaluateMonthlyTrigger(
      { monthlyScores: { '2026-04': 1.4, '2026-05': 1.9, '2026-06': 1.1 } },
      MONTHS,
      POLICY_PIP_RATING,
    );
    expect(r.qualifies).toBe(true);
    expect(r.worstScore).toBe(1.1);
    expect(r.shortWindow).toBe(false);
  });

  it('does not qualify when a month reaches the threshold', () => {
    const r = evaluateMonthlyTrigger(
      { monthlyScores: { '2026-04': 1.4, '2026-05': 2, '2026-06': 1.1 } },
      MONTHS,
      POLICY_PIP_RATING,
    );
    expect(r.qualifies).toBe(false);
  });

  it('does not qualify on an incomplete window and reports the gap', () => {
    const r = evaluateMonthlyTrigger(
      { monthlyScores: { '2026-04': 1.4, '2026-06': 1.1 } },
      MONTHS,
      POLICY_PIP_RATING,
    );
    expect(r.qualifies).toBe(false);
    expect(r.months.find(m => m.key === '2026-05')?.score).toBeNull();
  });

  it('flags a window shorter than the policy consecutive-month rule', () => {
    const r = evaluateMonthlyTrigger({ monthlyScores: { '2026-06': 1 } }, ['2026-06'], 2);
    expect(r.shortWindow).toBe(true);
    expect(POLICY_CONSECUTIVE_MONTHS).toBe(3);
  });
});

describe('annual trigger (POLICY §15.3)', () => {
  it('qualifies at exactly the threshold (at-or-below wording)', () => {
    expect(evaluateAnnualTrigger(2, 2).qualifies).toBe(true);
  });
  it('does not qualify above the threshold', () => {
    expect(evaluateAnnualTrigger(2.01, 2).qualifies).toBe(false);
  });
  it('is inert without a rating or a threshold', () => {
    expect(evaluateAnnualTrigger(null, 2).qualifies).toBe(false);
    expect(evaluateAnnualTrigger(1, null).qualifies).toBe(false);
  });
});

describe('trigger reason text', () => {
  it('cites the policy clause and the evidence months', () => {
    const monthly = evaluateMonthlyTrigger(
      { monthlyScores: { '2026-04': 1.4, '2026-05': 1.9, '2026-06': 1.1 } },
      MONTHS,
      2,
    );
    const text = resolveTriggerReason({ threshold: 2, monthly, annual: evaluateAnnualTrigger(1.8, 2) });
    expect(text).toContain('§15.2');
    expect(text).toContain('§15.3');
    expect(text).toContain('1.40');
  });

  it('is empty when nothing qualifies', () => {
    expect(resolveTriggerReason({ threshold: 2 })).toBe('');
  });
});

describe('candidate classification (POLICY §15.7 / §15.12)', () => {
  const today = d('2026-07-30');

  it('marks an employee with a live plan as non-eligible', () => {
    const c = classifyCandidate('e1', [
      { id: 'p1', employee_id: 'e1', status: 'active', end_date: '2026-09-01' },
    ], 3, today);
    expect(c.state).toBe('live_pip');
    expect(c.pipId).toBe('p1');
  });

  it('flags a relapse inside the sustain window', () => {
    const c = classifyCandidate('e1', [
      { id: 'p1', employee_id: 'e1', status: 'completed', end_date: '2026-06-30' },
    ], 3, today);
    expect(c.state).toBe('relapse_window');
  });

  it('is eligible once the sustain window has elapsed', () => {
    const c = classifyCandidate('e1', [
      { id: 'p1', employee_id: 'e1', status: 'completed', end_date: '2026-01-31' },
    ], 3, today);
    expect(c.state).toBe('eligible');
  });

  it('ignores other employees plans', () => {
    const c = classifyCandidate('e2', [
      { id: 'p1', employee_id: 'e1', status: 'active', end_date: '2026-09-01' },
    ], 3, today);
    expect(c.state).toBe('eligible');
  });
});

describe('duration and cadence guardrails (POLICY §15.7)', () => {
  const bounds = { minDays: 30, maxDays: 90 };

  it('accepts a plan inside the configured bounds', () => {
    expect(validatePipDuration(d('2026-08-01'), d('2026-09-30'), bounds).valid).toBe(true);
  });

  it('rejects a plan shorter than the minimum', () => {
    const r = validatePipDuration(d('2026-08-01'), d('2026-08-10'), bounds);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('at least 30 days');
  });

  it('rejects a plan longer than the maximum', () => {
    expect(validatePipDuration(d('2026-08-01'), d('2026-12-31'), bounds).valid).toBe(false);
  });

  it('requires at least one checkpoint', () => {
    expect(validateMilestoneCadence([], d('2026-08-01'), d('2026-09-30')).valid).toBe(false);
  });

  it('rejects a checkpoint outside the plan window', () => {
    expect(
      validateMilestoneCadence([d('2026-10-15')], d('2026-08-01'), d('2026-09-30')).valid,
    ).toBe(false);
    expect(
      validateMilestoneCadence([d('2026-07-15')], d('2026-08-01'), d('2026-09-30')).valid,
    ).toBe(false);
  });

  it('rejects a gap wider than the cadence limit', () => {
    const r = validateMilestoneCadence([d('2026-09-25')], d('2026-08-01'), d('2026-09-30'));
    expect(r.valid).toBe(false);
    expect(r.message).toContain('days apart');
  });

  it('accepts fortnightly checkpoints across the window', () => {
    const r = validateMilestoneCadence(
      [d('2026-08-15'), d('2026-08-31'), d('2026-09-15'), d('2026-09-30')],
      d('2026-08-01'),
      d('2026-09-30'),
    );
    expect(r.valid).toBe(true);
  });
});
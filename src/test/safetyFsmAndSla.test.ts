import { describe, it, expect } from 'vitest';
import {
  SAFETY_INCIDENT_STAGES,
  nextStage,
  validateFsmTransition,
  classifySlaState,
} from '@/lib/safetyIncidents';

/**
 * Phase 1.H test gate — workflow-rpc + sla-calculation pure-logic suite.
 *
 * These tests lock the client mirrors of the server-enforced rules:
 *  - sequential-only FSM (transition_safety_incident RPC)
 *  - sla_state classification (safety_incidents_with_sla view)
 *
 * They do NOT replace integration tests against the live DB — they catch
 * regressions in the SSOT (`src/lib/safetyIncidents.ts`) which the entire
 * Safety UI imports from.
 */
describe('Safety FSM — sequential transition rule', () => {
  it('exposes the canonical 7-stage order', () => {
    expect(SAFETY_INCIDENT_STAGES).toEqual([
      'reported',
      'assigned',
      'investigation',
      'rca',
      'corrective_action',
      'verification',
      'closed',
    ]);
  });

  it('nextStage advances exactly one step until closed', () => {
    expect(nextStage('reported')).toBe('assigned');
    expect(nextStage('assigned')).toBe('investigation');
    expect(nextStage('investigation')).toBe('rca');
    expect(nextStage('rca')).toBe('corrective_action');
    expect(nextStage('corrective_action')).toBe('verification');
    expect(nextStage('verification')).toBe('closed');
  });

  it('nextStage returns null at terminal / exception states', () => {
    expect(nextStage('closed')).toBeNull();
    expect(nextStage('orphaned')).toBeNull();
  });

  it('validateFsmTransition allows every adjacent forward step', () => {
    for (let i = 0; i < SAFETY_INCIDENT_STAGES.length - 1; i++) {
      const from = SAFETY_INCIDENT_STAGES[i];
      const to = SAFETY_INCIDENT_STAGES[i + 1];
      expect(validateFsmTransition(from, to)).toBeNull();
    }
  });

  it('blocks skipping stages', () => {
    expect(validateFsmTransition('reported', 'investigation')).toMatch(/sequential/i);
    expect(validateFsmTransition('reported', 'closed')).toMatch(/sequential/i);
    expect(validateFsmTransition('rca', 'closed')).toMatch(/sequential/i);
  });

  it('blocks reversing stages', () => {
    expect(validateFsmTransition('investigation', 'assigned')).toMatch(/sequential/i);
    expect(validateFsmTransition('verification', 'rca')).toMatch(/sequential/i);
  });

  it('blocks editing closed incidents', () => {
    expect(validateFsmTransition('closed', 'verification')).toMatch(/immutable/i);
    expect(validateFsmTransition('closed', 'reported')).toMatch(/immutable/i);
  });

  it('blocks self-transitions', () => {
    expect(validateFsmTransition('rca', 'rca')).toMatch(/already/i);
  });

  it('reviving orphaned incidents is server-only', () => {
    expect(validateFsmTransition('orphaned', 'reported')).toMatch(/server-side/i);
  });
});

describe('Safety SLA — classifySlaState mirrors the DB view', () => {
  const now = new Date('2026-04-29T12:00:00Z');
  const inFuture = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
  const inPast = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  it('returns "closed" regardless of deadlines when status=closed', () => {
    expect(
      classifySlaState({
        status: 'closed',
        acknowledge_due_at: inPast(48),
        close_due_at: inPast(24),
        now,
      }),
    ).toBe('closed');
  });

  it('returns "green" when both deadlines are still in the future', () => {
    expect(
      classifySlaState({
        status: 'reported',
        acknowledge_due_at: inFuture(2),
        close_due_at: inFuture(48),
        now,
      }),
    ).toBe('green');
  });

  it('returns "amber" once the acknowledge deadline has passed', () => {
    expect(
      classifySlaState({
        status: 'reported',
        acknowledge_due_at: inPast(1),
        close_due_at: inFuture(24),
        now,
      }),
    ).toBe('amber');
  });

  it('returns "red" once the close deadline has passed', () => {
    expect(
      classifySlaState({
        status: 'investigation',
        acknowledge_due_at: inPast(72),
        close_due_at: inPast(1),
        now,
      }),
    ).toBe('red');
  });

  it('"red" outranks "amber" — close-overdue wins even if status is open', () => {
    expect(
      classifySlaState({
        status: 'rca',
        acknowledge_due_at: inPast(48),
        close_due_at: inPast(2),
        now,
      }),
    ).toBe('red');
  });

  it('boundary: exactly at the acknowledge deadline is still "green"', () => {
    expect(
      classifySlaState({
        status: 'reported',
        acknowledge_due_at: now.toISOString(),
        close_due_at: inFuture(24),
        now,
      }),
    ).toBe('green');
  });
});

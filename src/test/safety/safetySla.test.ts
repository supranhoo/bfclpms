/**
 * Phase 11 — SSOT unit tests for `src/lib/safetySla.ts`.
 * Covers classify, countdown formatting, and queue prioritisation.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySla,
  formatSlaCountdown,
  prioritizeSlaQueue,
  badgeToneFor,
  type SlaIncidentLike,
} from '@/lib/safetySla';

const NOW = new Date('2026-05-30T12:00:00Z');

function inc(over: Partial<SlaIncidentLike>): SlaIncidentLike {
  return {
    id: 'i1',
    status: 'reported',
    created_at: '2026-05-30T00:00:00Z',
    close_due_at: '2026-05-31T00:00:00Z',
    ...over,
  };
}

describe('classifySla', () => {
  it('returns closed regardless of due', () => {
    const c = classifySla(inc({ status: 'closed' }), NOW);
    expect(c.state).toBe('closed');
    expect(c.overdue_ms).toBe(0);
  });

  it('returns red when past due', () => {
    const c = classifySla(inc({ close_due_at: '2026-05-30T10:00:00Z' }), NOW);
    expect(c.state).toBe('red');
    expect(c.overdue_ms).toBe(2 * 3_600_000);
  });

  it('returns amber when inside last 25% of window', () => {
    // created 00:00, due 16:00 → window 16h, amber after 12:00. now=12:00 → just amber.
    const c = classifySla(
      inc({ created_at: '2026-05-30T00:00:00Z', close_due_at: '2026-05-30T16:00:00Z' }),
      new Date('2026-05-30T13:00:00Z'),
    );
    expect(c.state).toBe('amber');
  });

  it('returns green when comfortably inside SLA', () => {
    const c = classifySla(
      inc({ created_at: '2026-05-30T11:00:00Z', close_due_at: '2026-06-05T11:00:00Z' }),
      NOW,
    );
    expect(c.state).toBe('green');
  });

  it('falls back to server hint when close_due_at missing', () => {
    const c = classifySla(
      inc({ close_due_at: null, sla_state: 'amber' }),
      NOW,
    );
    expect(c.state).toBe('amber');
    expect(c.remaining_ms).toBeNull();
  });
});

describe('formatSlaCountdown', () => {
  it('formats remaining time for amber/green', () => {
    const c = classifySla(
      inc({ created_at: '2026-05-30T11:00:00Z', close_due_at: '2026-05-30T15:00:00Z' }),
      NOW,
    );
    expect(formatSlaCountdown(c)).toMatch(/left$/);
  });

  it('formats overdue for red', () => {
    const c = classifySla(inc({ close_due_at: '2026-05-30T10:00:00Z' }), NOW);
    expect(formatSlaCountdown(c)).toMatch(/^Overdue/);
  });

  it('returns Closed for closed incidents', () => {
    const c = classifySla(inc({ status: 'closed' }), NOW);
    expect(formatSlaCountdown(c)).toBe('Closed');
  });
});

describe('prioritizeSlaQueue', () => {
  it('sorts red before amber before green before closed', () => {
    const rows = [
      { id: 'g', classification: classifySla(inc({ id: 'g', created_at: '2026-05-30T11:00:00Z', close_due_at: '2026-06-05T11:00:00Z' }), NOW) },
      { id: 'r', classification: classifySla(inc({ id: 'r', close_due_at: '2026-05-30T10:00:00Z' }), NOW) },
      { id: 'a', classification: classifySla(inc({ id: 'a', created_at: '2026-05-30T00:00:00Z', close_due_at: '2026-05-30T16:00:00Z' }), new Date('2026-05-30T13:00:00Z')) },
    ];
    const out = prioritizeSlaQueue(rows);
    expect(out.map((r) => r.id)).toEqual(['r', 'a', 'g']);
  });
});

describe('badgeToneFor', () => {
  it('maps states to design tones', () => {
    expect(badgeToneFor('red')).toBe('destructive');
    expect(badgeToneFor('amber')).toBe('secondary');
    expect(badgeToneFor('green')).toBe('outline');
    expect(badgeToneFor('closed')).toBe('outline');
  });
});
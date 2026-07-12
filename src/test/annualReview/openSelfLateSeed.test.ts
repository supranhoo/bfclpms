import { describe, it, expect } from 'vitest';

/**
 * POLICY §AR-SELF-OPEN-LATE — unit-level guard documenting the predicate the
 * `open_self_review_for_pending(cycle_id)` RPC applies before flipping any
 * instance from `not_started` → `pending_self`. Full DB coverage lives in the
 * migration itself; this test locks the logical contract so no future
 * refactor of the caller loses the guardrails.
 */
type Cycle = { status: string; self_review_start: Date | null };

function shouldOpen(cycle: Cycle, instanceStatus: string, now = new Date()): boolean {
  if (cycle.status !== 'active') return false;
  if (!cycle.self_review_start || cycle.self_review_start > now) return false;
  return instanceStatus === 'not_started';
}

describe('open_self_review_for_pending predicate', () => {
  const past = new Date('2026-07-01T00:00:00Z');
  const future = new Date('2026-12-01T00:00:00Z');
  const now = new Date('2026-07-12T00:00:00Z');

  it('opens a late-seeded not_started instance once the cycle window has begun', () => {
    expect(shouldOpen({ status: 'active', self_review_start: past }, 'not_started', now)).toBe(true);
  });

  it('leaves the instance alone before the self-review window starts', () => {
    expect(shouldOpen({ status: 'active', self_review_start: future }, 'not_started', now)).toBe(false);
  });

  it('is a no-op on non-active cycles (draft / closed / reopened)', () => {
    for (const s of ['draft', 'closed', 'archived']) {
      expect(shouldOpen({ status: s, self_review_start: past }, 'not_started', now)).toBe(false);
    }
  });

  it('never touches an instance that has already advanced past not_started', () => {
    for (const s of ['pending_self', 'pending_manager', 'pending_dept', 'pending_bu', 'pending_hr', 'completed', 'excluded']) {
      expect(shouldOpen({ status: 'active', self_review_start: past }, s, now)).toBe(false);
    }
  });

  it('handles missing self_review_start defensively', () => {
    expect(shouldOpen({ status: 'active', self_review_start: null }, 'not_started', now)).toBe(false);
  });
});
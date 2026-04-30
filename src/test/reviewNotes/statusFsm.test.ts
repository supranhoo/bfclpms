import { describe, it, expect } from 'vitest';

/**
 * Status FSM is intentionally permissive at the data layer (any → any),
 * but the *completion stamps* are managed by a DB trigger:
 *  - status -> completed: stamp completed_at + completed_by
 *  - status leaves completed: clear stamps
 *
 * This test mirrors the trigger logic in JS so we lock the contract in code.
 */

type Status = 'pending' | 'in_progress' | 'completed';
interface Row { status: Status; completed_at: string | null; completed_by: string | null; }

function applyStatusChange(prev: Row, nextStatus: Status, actor: string): Row {
  const next: Row = { ...prev, status: nextStatus };
  if (nextStatus === 'completed' && prev.status !== 'completed') {
    next.completed_at = '2026-04-30T00:00:00Z';
    next.completed_by = next.completed_by ?? actor;
  } else if (nextStatus !== 'completed') {
    next.completed_at = null;
    next.completed_by = null;
  }
  return next;
}

describe('review note status FSM mirror', () => {
  const empty: Row = { status: 'pending', completed_at: null, completed_by: null };

  it('pending → in_progress keeps stamps null', () => {
    const out = applyStatusChange(empty, 'in_progress', 'u1');
    expect(out.completed_at).toBeNull();
    expect(out.completed_by).toBeNull();
  });

  it('in_progress → completed sets stamps', () => {
    const out = applyStatusChange({ ...empty, status: 'in_progress' }, 'completed', 'u1');
    expect(out.completed_at).not.toBeNull();
    expect(out.completed_by).toBe('u1');
  });

  it('completed → pending clears stamps (re-open)', () => {
    const completed: Row = { status: 'completed', completed_at: '2026-04-29', completed_by: 'u1' };
    const out = applyStatusChange(completed, 'pending', 'u2');
    expect(out.completed_at).toBeNull();
    expect(out.completed_by).toBeNull();
  });

  it('completed → completed (no-op) does not re-stamp', () => {
    const completed: Row = { status: 'completed', completed_at: '2026-04-29', completed_by: 'u1' };
    const out = applyStatusChange(completed, 'completed', 'u2');
    expect(out.completed_by).toBe('u1');
  });
});
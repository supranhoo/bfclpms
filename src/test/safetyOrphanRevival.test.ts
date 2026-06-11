import { describe, it, expect } from 'vitest';
import { validateFsmTransition } from '@/lib/safetyIncidents';

/**
 * ADR-089 — orphan revival path.
 * The client-side FSM mirror must continue to refuse direct
 * `orphaned → *` transitions; the revival path is server-only via
 * `revive_orphaned_safety_incident` RPC.
 */
describe('Orphan incident revival (ADR-089)', () => {
  it('still blocks direct client transitions out of orphaned', () => {
    expect(validateFsmTransition('orphaned', 'reported')).toMatch(/server-side/i);
    expect(validateFsmTransition('orphaned', 'assigned')).toMatch(/server-side/i);
    expect(validateFsmTransition('orphaned', 'closed')).toMatch(/server-side/i);
  });

  it('keeps closed terminal', () => {
    expect(validateFsmTransition('closed', 'reported')).toMatch(/immutable/i);
  });
});
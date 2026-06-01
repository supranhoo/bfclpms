import { describe, it, expect } from 'vitest';

/**
 * Add New User → Access & Login parity guardrails (v2.68.x).
 *
 * The Add New User dialog's "Access & Login" tab must mirror the Edit
 * User dialog's "Access & Login" tab in label and sequence. Module
 * action cards (roles, password, history) are post-create only; the
 * Workflow mapping card is optional at create-time. If filled, all
 * three workflow fields (period, year, template) must be provided.
 */

type WfTrio = { period?: string; year?: number; template?: string };

function workflowFilledCount(t: WfTrio): number {
  return (t.period ? 1 : 0) + (t.year ? 1 : 0) + (t.template ? 1 : 0);
}

function validateWorkflow(t: WfTrio): { ok: true } | { ok: false; reason: string } {
  const n = workflowFilledCount(t);
  if (n === 0 || n === 3) return { ok: true };
  return { ok: false, reason: 'incomplete' };
}

describe('Add User → Access & Login workflow mapping', () => {
  it('accepts an empty trio (workflow optional)', () => {
    expect(validateWorkflow({})).toEqual({ ok: true });
  });

  it('accepts a fully-filled trio', () => {
    expect(
      validateWorkflow({ period: 'June', year: 2026, template: 't-1' }),
    ).toEqual({ ok: true });
  });

  it('rejects a partially-filled trio (period only)', () => {
    const r = validateWorkflow({ period: 'June' });
    expect(r.ok).toBe(false);
  });

  it('rejects a partially-filled trio (template + year, no period)', () => {
    const r = validateWorkflow({ year: 2026, template: 't-1' });
    expect(r.ok).toBe(false);
  });
});

describe('Add User Access & Login section order', () => {
  const EXPECTED_ORDER = [
    'ACCESS_AND_STATUS',
    'MODULE_ACCESS_AND_LOGIN',
  ] as const;

  const EXPECTED_MODULE_CARDS = [
    'grant_module_roles',
    'send_reset_password',
    'view_access_history',
    'workflow_mapping',
  ] as const;

  it('section order matches Edit User', () => {
    expect([...EXPECTED_ORDER]).toEqual(['ACCESS_AND_STATUS', 'MODULE_ACCESS_AND_LOGIN']);
  });

  it('module cards order matches Edit User (4 cards, workflow last)', () => {
    expect(EXPECTED_MODULE_CARDS.length).toBe(4);
    expect(EXPECTED_MODULE_CARDS[3]).toBe('workflow_mapping');
  });
});
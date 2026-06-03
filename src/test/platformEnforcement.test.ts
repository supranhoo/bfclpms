import { describe, it, expect } from 'vitest';
import {
  isEnforceable,
  shouldBlock,
  ENFORCEMENT_ALLOWLIST,
  BLOCK_MSG,
} from '@/lib/platformEnforcement';

describe('platformEnforcement.isEnforceable', () => {
  it('is true only for pms.data.export', () => {
    expect(isEnforceable('pms.data.export')).toBe(true);
  });
  it('is false for all other wrapped actions', () => {
    for (const k of [
      'pms.users.edit',
      'pms.kra.assign',
      'pms.workflow.template.edit',
      'pms.menu.delete',
      'pms.data.import',
      'pms.reports.performance.export',
    ]) {
      expect(isEnforceable(k)).toBe(false);
    }
  });
  it('allowlist has exactly one entry', () => {
    expect(ENFORCEMENT_ALLOWLIST).toEqual(['pms.data.export']);
  });
  it('block message is stable', () => {
    expect(BLOCK_MSG).toBe('This action is disabled by Platform Owner settings.');
  });
});

describe('platformEnforcement.shouldBlock — full truth table', () => {
  const action = 'pms.data.export';

  it('master OFF → never blocks (any combo)', () => {
    expect(shouldBlock({ hubEnabled: false, pilotEnabled: true, actionKey: action, entitled: false })).toBe(false);
    expect(shouldBlock({ hubEnabled: false, pilotEnabled: false, actionKey: action, entitled: false })).toBe(false);
  });

  it('master ON, pilot OFF, entitlement OFF → does not block (would_deny only)', () => {
    expect(shouldBlock({ hubEnabled: true, pilotEnabled: false, actionKey: action, entitled: false })).toBe(false);
  });

  it('master ON, pilot ON, entitlement ON → does not block', () => {
    expect(shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: action, entitled: true })).toBe(false);
  });

  it('master ON, pilot ON, entitlement OFF, action = pms.data.export → BLOCKS', () => {
    expect(shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: action, entitled: false })).toBe(true);
  });

  it('master ON, pilot ON, entitlement OFF, other action → does not block', () => {
    for (const k of ['pms.users.edit', 'pms.data.import', 'pms.kra.assign']) {
      expect(shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: k, entitled: false })).toBe(false);
    }
  });

  it('flipping pilot OFF after a block → no longer blocks (rollback)', () => {
    const before = shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: action, entitled: false });
    const after = shouldBlock({ hubEnabled: true, pilotEnabled: false, actionKey: action, entitled: false });
    expect(before).toBe(true);
    expect(after).toBe(false);
  });

  it('flipping entitlement ON after a block → no longer blocks (re-enable)', () => {
    const before = shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: action, entitled: false });
    const after = shouldBlock({ hubEnabled: true, pilotEnabled: true, actionKey: action, entitled: true });
    expect(before).toBe(true);
    expect(after).toBe(false);
  });
});
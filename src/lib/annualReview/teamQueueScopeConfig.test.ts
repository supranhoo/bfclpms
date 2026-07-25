import { describe, it, expect } from 'vitest';
import { resolveTeamQueueScopeConfig } from './teamQueueScopeConfig';

describe('resolveTeamQueueScopeConfig', () => {
  it('falls back to "any" and all scopes with no config', () => {
    const r = resolveTeamQueueScopeConfig({ role: 'manager', appSettings: null, profileOverride: null });
    expect(r.defaultScope).toBe('any');
    expect(r.allowedScopes).toContain('any');
    expect(r.allowUserOverride).toBe(true);
  });

  it('honors global default + allowed list', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: {
        team_queue_default_scope: 'dept',
        team_queue_allowed_scopes: ['dept', 'bu'],
      },
      profileOverride: null,
    });
    expect(r.defaultScope).toBe('dept');
    expect(r.allowedScopes).toEqual(expect.arrayContaining(['any', 'dept', 'bu']));
    expect(r.allowedScopes).not.toContain('manager');
  });

  it('per-role override wins over global', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: {
        team_queue_default_scope: 'any',
        team_queue_role_overrides: { manager: { default: 'manager', allowed: ['manager'] } },
      },
      profileOverride: null,
    });
    expect(r.defaultScope).toBe('manager');
    expect(r.allowedScopes).toEqual(expect.arrayContaining(['any', 'manager']));
  });

  it('user profile override wins when allowed', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: { team_queue_default_scope: 'any' },
      profileOverride: 'bu',
    });
    expect(r.defaultScope).toBe('bu');
  });

  it('user override is ignored when admin disallows it', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: { team_queue_default_scope: 'dept', team_queue_allow_user_override: false },
      profileOverride: 'bu',
    });
    expect(r.defaultScope).toBe('dept');
    expect(r.allowUserOverride).toBe(false);
  });

  it('keeps current selection visible even if newly disallowed', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: { team_queue_allowed_scopes: ['dept'] },
      profileOverride: null,
      currentSelection: 'manager',
    });
    expect(r.allowedScopes).toContain('manager');
  });

  it('intersects with available scopes; falls back to any when empty', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: { team_queue_allowed_scopes: ['bu'] },
      profileOverride: null,
      availableScopes: new Set(['manager']),
    });
    expect(r.allowedScopes).toEqual(['any']);
    expect(r.defaultScope).toBe('any');
  });

  it('invalid stored default falls back to "any"', () => {
    const r = resolveTeamQueueScopeConfig({
      role: 'manager',
      appSettings: { team_queue_default_scope: 'garbage' as any },
      profileOverride: null,
    });
    expect(r.defaultScope).toBe('any');
  });
});
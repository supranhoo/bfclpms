import { describe, it, expect } from 'vitest';
import { assertRowsTouched, PermissionError } from '@/lib/db/assertRowsTouched';

/**
 * Universal silent-RLS-failure guard contract.
 * See ADR-079 (Access-Profile / RLS alignment).
 */
describe('assertRowsTouched', () => {
  it('throws PermissionError when RLS returned zero rows', () => {
    expect(() =>
      assertRowsTouched([], null, {
        menuKey: 'admin-users',
        action: 'update',
        resource: 'this user',
      }),
    ).toThrow(PermissionError);
  });

  it('throws PermissionError when data is null with no error', () => {
    expect(() =>
      assertRowsTouched(null, null, { action: 'delete', resource: 'this assignment' }),
    ).toThrow(/permission/i);
  });

  it('passes when at least one row was touched', () => {
    expect(() => assertRowsTouched([{ id: 'r1' }], null)).not.toThrow();
  });

  it('surfaces supabase errors verbatim', () => {
    expect(() => assertRowsTouched(null, { message: 'connection lost' })).toThrow('connection lost');
  });

  it('uses action-specific verb in the message', () => {
    try {
      assertRowsTouched([], null, { action: 'add', resource: 'this profile assignment' });
    } catch (e) {
      expect((e as Error).message).toMatch(/create this profile assignment/);
    }
  });

  it('carries menuKey and action on the thrown error', () => {
    try {
      assertRowsTouched([], null, { menuKey: 'admin-access-profiles', action: 'delete' });
    } catch (e) {
      const pe = e as PermissionError;
      expect(pe.code).toBe('PERMISSION_DENIED');
      expect(pe.menuKey).toBe('admin-access-profiles');
      expect(pe.action).toBe('delete');
    }
  });
});
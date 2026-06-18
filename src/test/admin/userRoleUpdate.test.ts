import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression test for the "duplicate key value violates unique constraint
 * user_roles_user_id_role_key" bug when editing a user that already had
 * platform_owner + admin in user_roles.
 *
 * The contract enforced by `setFunctionalRole`:
 *   1. Only functional roles are accepted; passing a platform-tier role throws.
 *   2. The supabase RPC `set_functional_role` is invoked with the right args.
 *   3. RPC errors are propagated (admin RLS / 42501).
 */

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

import { setFunctionalRole, isFunctionalRole, FUNCTIONAL_ROLES } from '@/lib/userRoles';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('isFunctionalRole', () => {
  it('accepts every functional role', () => {
    FUNCTIONAL_ROLES.forEach((r) => expect(isFunctionalRole(r)).toBe(true));
  });
  it('rejects platform-tier roles', () => {
    expect(isFunctionalRole('platform_owner')).toBe(false);
    expect(isFunctionalRole('implementation_admin')).toBe(false);
  });
});

describe('setFunctionalRole', () => {
  it('invokes the set_functional_role RPC with the correct payload', async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    await setFunctionalRole('user-1', 'manager');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('set_functional_role', {
      p_user_id: 'user-1',
      p_new_role: 'manager',
    });
  });

  it('refuses to write a platform-tier role through this helper', async () => {
    await expect(setFunctionalRole('user-1', 'platform_owner' as any)).rejects.toThrow(
      /platform-tier role/i,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('propagates RPC errors (e.g. RLS 42501) to the caller', async () => {
    rpcMock.mockResolvedValueOnce({ error: { code: '42501', message: 'Only admins…' } });
    await expect(setFunctionalRole('user-1', 'admin')).rejects.toMatchObject({ code: '42501' });
  });

  it('is idempotent at the call layer: same role can be re-applied (RPC handles no-op)', async () => {
    rpcMock.mockResolvedValue({ error: null });
    await setFunctionalRole('user-1', 'admin');
    await setFunctionalRole('user-1', 'admin');
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
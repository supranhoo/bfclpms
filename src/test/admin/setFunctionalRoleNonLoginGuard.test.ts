import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression: set_functional_role RPC must no-op for non-login users
 * (profile row exists but no auth.users row → user_roles FK would blow up).
 *
 * RCA CAPA-2026-07 §113a: guard added inside the SECURITY DEFINER function;
 * the client-side helper simply forwards. This test locks the client contract
 * so any future refactor that adds a pre-check must keep the RPC as SSOT.
 */

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import { setFunctionalRole } from '@/lib/userRoles';

beforeEach(() => rpcMock.mockReset());

describe('setFunctionalRole — non-login guard is delegated to the RPC', () => {
  it('forwards the call to the RPC without pre-checking auth.users (SSOT is the DB function)', async () => {
    rpcMock.mockResolvedValueOnce({ error: null }); // RPC internally no-ops for non-login
    await setFunctionalRole('non-login-user-uuid', 'employee');
    expect(rpcMock).toHaveBeenCalledWith('set_functional_role', {
      p_user_id: 'non-login-user-uuid',
      p_new_role: 'employee',
    });
  });

  it('propagates any residual FK error verbatim so regressions surface loudly', async () => {
    rpcMock.mockResolvedValueOnce({
      error: {
        code: '23503',
        message:
          'insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey"',
      },
    });
    await expect(setFunctionalRole('ghost', 'manager')).rejects.toMatchObject({ code: '23503' });
  });
});
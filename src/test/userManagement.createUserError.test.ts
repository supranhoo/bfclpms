import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

/**
 * Regression guard for the Add New User "Edge Function returned a non-2xx
 * status code" toast (BUG: Brundaban Chandra Das, 2026-06-10).
 *
 * `supabase.functions.invoke()` swallows the JSON body of non-2xx
 * responses. Routing create-employee through `invokeAdminEdgeFunction`
 * surfaces the actual reason ("A user with this email address has
 * already been registered", "Unknown employee category: ..." etc.) so
 * admins can self-correct.
 */
describe('createUser — surfaces edge-function error body', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(import.meta.env, {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'anon-key',
    });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    } as any);
  });

  it('throws the real "already registered" error from the JSON body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () =>
        JSON.stringify({
          error: 'Failed to create user: A user with this email address has already been registered',
        }),
    } as Response);

    await expect(
      invokeAdminEdgeFunction('create-employee', { full_name: 'X', employee_code: '102028' }),
    ).rejects.toThrow(/already been registered/);
  });

  it('throws the 400 validation error verbatim', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "Unknown employee category: 'XYZ'" }),
    } as Response);

    await expect(
      invokeAdminEdgeFunction('create-employee', { full_name: 'X', employee_code: 'E1' }),
    ).rejects.toThrow(/Unknown employee category/);
  });

  it('never masks the body as the generic "non-2xx status code" toast', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: 'duplicate employee_code' }),
    } as Response);

    await expect(
      invokeAdminEdgeFunction('create-employee', {}),
    ).rejects.not.toThrow(/non-2xx/i);
  });
});
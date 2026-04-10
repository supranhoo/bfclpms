import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('invokeAdminEdgeFunction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(import.meta.env, {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'anon-key',
    });
  });

  it('forwards bearer token and payload explicitly', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    } as any);

    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    } as Response);

    const result = await invokeAdminEdgeFunction<{ success: boolean }>('bulk-zero-score-non-submitters', {
      mode: 'scan',
      review_period: 'April',
      review_year: 2026,
    });

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/bulk-zero-score-non-submitters',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          apikey: 'anon-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('throws a clear error when no session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any);

    await expect(invokeAdminEdgeFunction('bulk-zero-score-non-submitters', { mode: 'scan' }))
      .rejects
      .toThrow('Not authenticated');
  });
});
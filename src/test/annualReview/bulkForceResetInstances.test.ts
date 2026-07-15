import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { bulkForceResetInstances } from '@/services/annualReview/annualReviewService';

/**
 * Guards the single-employee "Reset & reassign template" entry-point on the
 * Admin Progress table. That UI calls `bulkForceResetInstances` with n=1 and
 * relies on the RPC to archive + wipe responses, swap the template, and
 * restart the instance at `pending_self`.
 */
describe('bulkForceResetInstances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits on empty input without hitting the RPC', async () => {
    const out = await bulkForceResetInstances([], 'unused');
    expect(out).toEqual({ ok: 0, failed: [] });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('sends items as snake_case payload with the reason', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: 1, failed: [] }, error: null,
    });
    const out = await bulkForceResetInstances(
      [{ instanceId: 'inst-1', templateId: 'tpl-new' }],
      'Employee changed role; earlier self-review is invalid.',
    );
    expect(out).toEqual({ ok: 1, failed: [] });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'bulk_force_reset_annual_review_instances',
      {
        p_items: [{ instance_id: 'inst-1', new_template_id: 'tpl-new' }],
        p_reason: 'Employee changed role; earlier self-review is invalid.',
      },
    );
  });

  it('surfaces per-row failures returned by the RPC', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { ok: 0, failed: [{ instance_id: 'inst-1', error: 'not authorized' }] },
      error: null,
    });
    const out = await bulkForceResetInstances(
      [{ instanceId: 'inst-1', templateId: 'tpl-new' }],
      'valid reason text here',
    );
    expect(out.ok).toBe(0);
    expect(out.failed).toEqual([{ instanceId: 'inst-1', error: 'not authorized' }]);
  });

  it('throws when the RPC itself errors', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null, error: { message: 'permission denied' },
    });
    await expect(
      bulkForceResetInstances(
        [{ instanceId: 'inst-1', templateId: 'tpl-new' }],
        'valid reason text here',
      ),
    ).rejects.toThrow('permission denied');
  });
});
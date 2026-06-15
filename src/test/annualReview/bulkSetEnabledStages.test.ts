import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { bulkSetEnabledStages, setEnabledStages } from '@/services/annualReview/annualReviewService';

describe('setEnabledStages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalises the chain and forwards to the RPC (self optional)', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    await setEnabledStages({ instanceId: 'i1', enabledStages: ['hr', 'manager'], reason: 'restructure' });
    expect(supabase.rpc).toHaveBeenCalledWith('set_annual_review_enabled_stages', {
      p_instance_id: 'i1',
      // canonical order, self NOT forced in
      p_enabled_stages: ['manager', 'hr'],
      p_reason: 'restructure',
    });
  });

  it('forwards a self-only chain unchanged', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    await setEnabledStages({ instanceId: 'i1', enabledStages: ['self'], reason: 'self only' });
    expect(supabase.rpc).toHaveBeenCalledWith('set_annual_review_enabled_stages', {
      p_instance_id: 'i1',
      p_enabled_stages: ['self'],
      p_reason: 'self only',
    });
  });

  it('rethrows RPC errors', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: { message: 'denied' } });
    await expect(
      setEnabledStages({ instanceId: 'i1', enabledStages: ['self'], reason: 'why' }),
    ).rejects.toMatchObject({ message: 'denied' });
  });
});

describe('bulkSetEnabledStages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports per-row outcomes and progress', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    const progress: Array<[number, number]> = [];
    const out = await bulkSetEnabledStages(
      [
        { instanceId: 'i1', enabledStages: ['self', 'manager'], reason: 'r1', rowKey: 'E1' },
        { instanceId: 'i2', enabledStages: ['self', 'hr'],      reason: 'r2', rowKey: 'E2' },
      ],
      (d, t) => progress.push([d, t]),
    );
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.ok)).toBe(true);
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it('isolates per-row failures', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'stage gate' } })
      .mockResolvedValueOnce({ error: null });
    const out = await bulkSetEnabledStages([
      { instanceId: 'i1', enabledStages: ['self', 'manager'], reason: 'r' },
      { instanceId: 'i2', enabledStages: ['self', 'manager'], reason: 'r' },
      { instanceId: 'i3', enabledStages: ['self', 'manager'], reason: 'r' },
    ]);
    expect(out.map((r) => r.ok)).toEqual([true, false, true]);
    expect(out[1].error).toBe('stage gate');
  });
});
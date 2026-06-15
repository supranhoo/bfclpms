import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { bulkSetTemplateOverrides } from '@/services/annualReview/annualReviewService';

describe('bulkSetTemplateOverrides', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok per row when RPC succeeds and reports progress', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    const progress: Array<[number, number]> = [];
    const out = await bulkSetTemplateOverrides(
      [
        { instanceId: 'i1', templateId: 't1', reason: 'reorg', rowKey: 'E1' },
        { instanceId: 'i2', templateId: null, reason: 'reset', rowKey: 'E2' },
      ],
      (d, t) => progress.push([d, t]),
    );
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.ok)).toBe(true);
    expect(out.map((r) => r.rowKey)).toEqual(['E1', 'E2']);
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('captures per-row failures without aborting the batch', async () => {
    (supabase.rpc as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'stage gate' } })
      .mockResolvedValueOnce({ error: null });
    const out = await bulkSetTemplateOverrides([
      { instanceId: 'i1', templateId: 't1', reason: 'ok', rowKey: 'A' },
      { instanceId: 'i2', templateId: 't1', reason: 'ok', rowKey: 'B' },
      { instanceId: 'i3', templateId: 't1', reason: 'ok', rowKey: 'C' },
    ]);
    expect(out.map((r) => r.ok)).toEqual([true, false, true]);
    expect(out[1].error).toBe('stage gate');
  });
});
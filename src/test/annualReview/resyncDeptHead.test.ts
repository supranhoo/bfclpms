import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';
import { resyncAnnualReviewDeptHead } from '@/services/annualReview/resyncDeptHead';

describe('resyncAnnualReviewDeptHead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls the RPC with cycle + department and returns normalized counts', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: { updated: 12, skipped: 3, new_head_id: 'user-1' },
      error: null,
    });
    const r = await resyncAnnualReviewDeptHead('cyc-1', 'dept-1');
    expect(supabase.rpc).toHaveBeenCalledWith('resync_annual_review_dept_head', {
      p_cycle_id: 'cyc-1', p_dept_id: 'dept-1',
    });
    expect(r).toEqual({ updated: 12, skipped: 3, new_head_id: 'user-1' });
  });

  it('coerces missing fields to zero / empty string', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: {}, error: null });
    const r = await resyncAnnualReviewDeptHead('c', 'd');
    expect(r).toEqual({ updated: 0, skipped: 0, new_head_id: '' });
  });

  it('propagates RPC errors', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: new Error('not authorized') });
    await expect(resyncAnnualReviewDeptHead('c', 'd')).rejects.toThrow('not authorized');
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  searchActiveEmployeesForReview,
  createOrGetAnnualReviewInstance,
} from '@/services/annualReview/employeeDirectory';

beforeEach(() => rpcMock.mockReset());

describe('employeeDirectory service', () => {
  it('returns empty array when no cycle provided', async () => {
    const out = await searchActiveEmployeesForReview({ query: 'foo', cycleId: '' });
    expect(out).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('passes args to RPC and returns data', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ employee_id: 'e1', full_name: 'Foo', has_email: true, has_signed_in: true }],
      error: null,
    });
    const out = await searchActiveEmployeesForReview({ query: 'foo', cycleId: 'c1', limit: 10 });
    expect(rpcMock).toHaveBeenCalledWith('search_active_employees_for_review', {
      p_query: 'foo', p_cycle_id: 'c1', p_limit: 10, p_offset: 0,
    });
    expect(out).toHaveLength(1);
  });

  it('throws when RPC returns error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(searchActiveEmployeesForReview({ query: '', cycleId: 'c1' })).rejects.toThrow('denied');
  });

  it('createOrGet returns instance id + flag', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ instance_id: 'i1', was_created: true }],
      error: null,
    });
    const out = await createOrGetAnnualReviewInstance('e1', 'c1');
    expect(out).toEqual({ instanceId: 'i1', wasCreated: true });
  });

  it('createOrGet handles non-array RPC result', async () => {
    rpcMock.mockResolvedValueOnce({ data: { instance_id: 'i9', was_created: false }, error: null });
    const out = await createOrGetAnnualReviewInstance('e1', 'c1');
    expect(out.instanceId).toBe('i9');
    expect(out.wasCreated).toBe(false);
  });

  it('createOrGet throws on rpc error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(createOrGetAnnualReviewInstance('e1', 'c1')).rejects.toThrow('permission denied');
  });
});

/**
 * ADR-269 addendum — the apply path must never stop at a fixed ceiling and must
 * never re-write KPIs that are already structured.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useApplyKpiSplit } from '@/hooks/useKpiTextSplit';

// Extract the mutationFn without React by calling the hook factory's options.
vi.mock('@tanstack/react-query', () => ({
  useMutation: (opts: { mutationFn: (v: unknown) => Promise<unknown> }) => opts,
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

describe('kpi split apply batching', () => {
  beforeEach(() => rpc.mockReset());

  it('loops until the server reports fewer rows than the batch size', async () => {
    rpc
      .mockResolvedValueOnce({ data: { run_id: 'r1', applied: 5000 }, error: null })
      .mockResolvedValueOnce({ data: { run_id: 'r2', applied: 339 }, error: null });

    const m = useApplyKpiSplit() as unknown as { mutationFn: (v: unknown) => Promise<{ applied: number; batches: number; run_ids: string[] }> };
    const res = await m.mutationFn({ confidence: 'high' });

    expect(res.applied).toBe(5339);
    expect(res.batches).toBe(2);
    expect(res.run_ids).toEqual(['r1', 'r2']);
  });

  it('stops immediately when nothing is pending (idempotent re-run)', async () => {
    rpc.mockResolvedValueOnce({ data: { run_id: 'r1', applied: 0 }, error: null });
    const m = useApplyKpiSplit() as unknown as { mutationFn: (v: unknown) => Promise<{ applied: number; batches: number }> };
    const res = await m.mutationFn({ confidence: 'high' });
    expect(res.applied).toBe(0);
    expect(res.batches).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('never sends kpi_name in any apply payload', async () => {
    rpc.mockResolvedValueOnce({ data: { run_id: 'r1', applied: 0 }, error: null });
    const m = useApplyKpiSplit() as unknown as { mutationFn: (v: unknown) => Promise<unknown> };
    await m.mutationFn({ confidence: 'high' });
    for (const call of rpc.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('kpi_name');
    }
  });
});

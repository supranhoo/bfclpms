import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBackfillAllManagement } from '@/hooks/useAccessControlAdmin';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => rpcMock.mockReset());

describe('useBackfillAllManagement', () => {
  it('calls the bulk RPC with the supplied args and returns rows', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { management_uid: 'm1', management_name: 'Gaurav', rows_stamped: 19, rows_reopened: 14, snapshots_written: 19 },
        { management_uid: 'm2', management_name: 'Dummy',  rows_stamped: 1,  rows_reopened: 1,  snapshots_written: 1 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useBackfillAllManagement(), { wrapper: wrapper() });
    result.current.mutate({ reopen_completed: true, dry_run: true, reason: 'rollout' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('backfill_management_stage_all', {
      p_reopen_completed: true, p_dry_run: true, p_reason: 'rollout',
    });
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].rows_stamped).toBe(19);
  });

  it('returns empty array when RPC returns null data', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useBackfillAllManagement(), { wrapper: wrapper() });
    result.current.mutate({ reopen_completed: false, dry_run: true, reason: 'noop' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('surfaces RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'not authorized' } });
    const { result } = renderHook(() => useBackfillAllManagement(), { wrapper: wrapper() });
    result.current.mutate({ reopen_completed: false, dry_run: false, reason: 'x' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('not authorized');
  });
});
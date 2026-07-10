import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

import { useDirectoryAccess } from '@/hooks/useDirectoryAccess';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => rpcMock.mockReset());

describe('useDirectoryAccess', () => {
  it('grants all-scope for admin / hr_pms / hr_team', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { can_access: true, scope: 'all', business_unit_id: null },
      error: null,
    });
    const { result } = renderHook(() => useDirectoryAccess(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess).toBe(true);
    expect(result.current.scope).toBe('all');
    expect(result.current.businessUnitId).toBeNull();
  });

  it('grants BU-scope for BU heads and HODs', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { can_access: true, scope: 'bu', business_unit_id: 'bu-1' },
      error: null,
    });
    const { result } = renderHook(() => useDirectoryAccess(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess).toBe(true);
    expect(result.current.scope).toBe('bu');
    expect(result.current.businessUnitId).toBe('bu-1');
  });

  it('denies when resolver returns can_access=false', async () => {
    rpcMock.mockResolvedValueOnce({ data: { can_access: false }, error: null });
    const { result } = renderHook(() => useDirectoryAccess(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess).toBe(false);
    expect(result.current.scope).toBeNull();
  });

  it('denies (fail-closed) on RPC error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useDirectoryAccess(), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccess).toBe(false);
  });
});

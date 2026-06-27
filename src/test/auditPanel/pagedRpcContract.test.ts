import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// --- Mocks ---------------------------------------------------------------
const rpcSpy = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: any[]) => rpcSpy(...args) },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isReady: true, user: { id: 'viewer-1' } }),
}));

import { useReviewerDashboardPage } from '@/hooks/useReviewerDashboardPage';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const SAMPLE_ROW = {
  id: 'e1', full_name: 'Alice', email: 'a@x', designation: 'Engineer',
  department: 'Tech', grade: 'L3', reporting_manager_id: 'm1',
  is_active: true, avatar_url: null,
  total_kpis: 5, cleared_kra_set: 4, pending_count: 2, reviewed_count: 1,
  total_count: 42,
};

describe('useReviewerDashboardPage — RPC contract', () => {
  beforeEach(() => {
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValue({ data: [SAMPLE_ROW], error: null });
  });

  it('calls get_reviewer_dashboard_page with the expected paged params', async () => {
    const { result } = renderHook(
      () => useReviewerDashboardPage({
        viewLevel: 'audit', period: 'June', year: 2026,
        search: 'ali', empStatus: 'active', sort: 'name_asc',
        page: 3, pageSize: 24,
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcSpy.mock.calls[0];
    expect(fn).toBe('get_reviewer_dashboard_page');
    expect(args).toMatchObject({
      p_view_level: 'audit',
      p_period: 'June',
      p_year: 2026,
      p_search: 'ali',
      p_emp_status: 'active',
      p_sort: 'name_asc',
      p_offset: 48,          // (3-1) * 24
      p_limit: 24,
    });
  });

  it('maps total_count from the first row into totalCount and totalPages', async () => {
    const { result } = renderHook(
      () => useReviewerDashboardPage({
        viewLevel: 'audit', period: 'June', year: 2026,
        page: 1, pageSize: 24,
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalCount).toBe(42);
    expect(result.current.data?.totalPages).toBe(2); // ceil(42/24)
    expect(result.current.data?.rows[0].id).toBe('e1');
    expect(result.current.data?.rows[0].pending_count).toBe(2);
  });

  it('returns 0 totalCount when no rows', async () => {
    rpcSpy.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(
      () => useReviewerDashboardPage({
        viewLevel: 'hr_pms', period: 'June', year: 2026,
        page: 1, pageSize: 24,
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalCount).toBe(0);
    expect(result.current.data?.rows).toEqual([]);
  });

  it('coerces page<1 and pageSize>200 to safe bounds', async () => {
    renderHook(
      () => useReviewerDashboardPage({
        viewLevel: 'audit', period: 'June', year: 2026,
        page: 0, pageSize: 999,
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(rpcSpy).toHaveBeenCalled());
    const args = rpcSpy.mock.calls[0][1];
    expect(args.p_offset).toBe(0);
    expect(args.p_limit).toBe(200);
  });
});
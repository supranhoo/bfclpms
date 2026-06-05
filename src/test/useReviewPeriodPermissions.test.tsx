import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock auth: a fixed user id so the query is enabled.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, role: 'auditor' }),
}));

// Mock the Supabase client. RPC behaviour per action is controlled per test
// via `rpcImpl`. The `from('review_periods')...maybeSingle()` chain is also
// stubbed.
let rpcImpl: (args: { p_action: string }) => { data: unknown; error: unknown };
let periodData: unknown = { current_stage: 'planning' };
let periodError: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((_name: string, args: { p_action: string }) => Promise.resolve(rpcImpl(args))),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: periodData, error: periodError }),
          }),
        }),
      }),
    })),
  },
}));

import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useReviewPeriodPermissions — fail-open semantics (ADR-074)', () => {
  beforeEach(() => {
    rpcImpl = () => ({ data: true, error: null });
    periodData = { current_stage: 'planning' };
    periodError = null;
  });

  it('all RPCs succeed: permissions match RPC, no phantom lock', async () => {
    rpcImpl = ({ p_action }) => ({
      data: p_action === 'view_only' ? false : true,
      error: null,
    });
    const { result } = renderHook(
      () => useReviewPeriodPermissions('May', 2026),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.view_only).toBe(false);
    expect(result.current.edit_kpi).toBe(true);
    expect(result.current.edit_scores).toBe(true);
    expect(result.current.periodStage).toBe('planning');
    const hasRestrictions =
      result.current.view_only || !result.current.edit_kpi || !result.current.edit_scores;
    expect(hasRestrictions).toBe(false);
  });

  it('view_only RPC errors: defaults to view_only=false (no phantom lock)', async () => {
    rpcImpl = ({ p_action }) =>
      p_action === 'view_only'
        ? { data: null, error: { message: 'network blip' } }
        : { data: true, error: null };
    const { result } = renderHook(
      () => useReviewPeriodPermissions('May', 2026),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.view_only).toBe(false);
    expect(result.current.edit_kpi).toBe(true);
    const hasRestrictions =
      result.current.view_only || !result.current.edit_kpi || !result.current.edit_scores;
    expect(hasRestrictions).toBe(false);
  });

  it('non-view_only RPC errors: defaults to true (permissive)', async () => {
    rpcImpl = ({ p_action }) =>
      p_action === 'edit_kpi'
        ? { data: null, error: { message: 'transient' } }
        : p_action === 'view_only'
          ? { data: false, error: null }
          : { data: true, error: null };
    const { result } = renderHook(
      () => useReviewPeriodPermissions('May', 2026),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.edit_kpi).toBe(true);
    expect(result.current.view_only).toBe(false);
  });

  it('non-boolean RPC payload falls back to permissive default', async () => {
    rpcImpl = ({ p_action }) => ({
      data: p_action === 'view_only' ? (undefined as unknown) : (null as unknown),
      error: null,
    });
    const { result } = renderHook(
      () => useReviewPeriodPermissions('May', 2026),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.view_only).toBe(false);
    expect(result.current.edit_kpi).toBe(true);
  });

  it('period fetch fails: periodStage=null, no crash', async () => {
    periodData = null;
    periodError = { message: 'denied' };
    const { result } = renderHook(
      () => useReviewPeriodPermissions('May', 2026),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.periodStage).toBeNull();
  });
});
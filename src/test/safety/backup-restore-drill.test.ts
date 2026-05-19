import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useSafetyDrill } from '@/hooks/useSafetyDrill';

const invokeMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSafetyDrill', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastMock.mockReset();
  });

  it('surfaces baseline / after deltas on success', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        drill_id: 'd1',
        backup_id: null,
        started_at: 't0',
        finished_at: 't1',
        baseline: { safety_incidents: 3, safety_permits: 2, safety_audit_runs: 1 },
        after: { safety_incidents: 3, safety_permits: 2, safety_audit_runs: 1 },
        deltas: [
          { table: 'safety_incidents', baseline: 3, after: 3, ok: true },
          { table: 'safety_permits', baseline: 2, after: 2, ok: true },
          { table: 'safety_audit_runs', baseline: 1, after: 1, ok: true },
        ],
        errors: null,
        performed_by: 'user-1',
      },
      error: null,
    });

    const { result } = renderHook(() => useSafetyDrill(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith('safety-drill', { body: {} });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Safety drill passed' })
    );
  });

  it('flags drift when post counts differ from baseline', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: false,
        drill_id: 'd2',
        backup_id: null,
        started_at: 't0',
        finished_at: 't1',
        baseline: { safety_incidents: 3, safety_permits: 2, safety_audit_runs: 1 },
        after: { safety_incidents: 2, safety_permits: 2, safety_audit_runs: 1 },
        deltas: [
          { table: 'safety_incidents', baseline: 3, after: 2, ok: false },
          { table: 'safety_permits', baseline: 2, after: 2, ok: true },
          { table: 'safety_audit_runs', baseline: 1, after: 1, ok: true },
        ],
        errors: null,
        performed_by: 'user-1',
      },
      error: null,
    });

    const { result } = renderHook(() => useSafetyDrill(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Safety drill detected drift',
      })
    );
  });

  it('forwards backup_id when provided (Flow B)', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        drill_id: 'd3',
        backup_id: 'backup-xyz',
        started_at: 't0',
        finished_at: 't1',
        baseline: { safety_incidents: 1, safety_permits: 1, safety_audit_runs: 1 },
        after: { safety_incidents: 1, safety_permits: 1, safety_audit_runs: 1 },
        deltas: [
          { table: 'safety_incidents', baseline: 1, after: 1, ok: true },
          { table: 'safety_permits', baseline: 1, after: 1, ok: true },
          { table: 'safety_audit_runs', baseline: 1, after: 1, ok: true },
        ],
        errors: null,
        performed_by: 'user-1',
      },
      error: null,
    });

    const { result } = renderHook(() => useSafetyDrill(), { wrapper });
    result.current.mutate({ backupId: 'backup-xyz' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith('safety-drill', {
      body: { backup_id: 'backup-xyz' },
    });
  });

  it('surfaces edge function errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useSafetyDrill(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Safety drill failed',
      })
    );
  });
});
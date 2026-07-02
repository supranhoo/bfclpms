import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/services/annualReview/annualReviewService', () => ({
  upsertResponseDraft: vi.fn(async () => ({ id: 'r1' })),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useDebouncedResponseDraft } from '@/hooks/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useDebouncedResponseDraft — ADR-105: no autosave', () => {
  beforeEach(() => { vi.useFakeTimers(); (svc.upsertResponseDraft as any).mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('setDraft does NOT persist on its own, even after long delays', () => {
    const { result } = renderHook(
      () => useDebouncedResponseDraft({ instanceId: 'i1', reviewerId: 'u1', role: 'manager' }),
      { wrapper },
    );
    act(() => { result.current.setDraft((p) => ({ ...p, criteria_scores: { X: 5 } })); });
    expect(result.current.status).toBe('pending');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(svc.upsertResponseDraft).not.toHaveBeenCalled();
    expect(result.current.status).toBe('pending');
  });

  it('flush() persists immediately and marks saved', async () => {
    const { result } = renderHook(
      () => useDebouncedResponseDraft({ instanceId: 'i1', reviewerId: 'u1', role: 'manager' }),
      { wrapper },
    );
    act(() => { result.current.setDraft((p) => ({ ...p, criteria_scores: { X: 4 } })); });
    await act(async () => { await result.current.flush(); });
    expect(svc.upsertResponseDraft).toHaveBeenCalledTimes(1);
    expect((svc.upsertResponseDraft as any).mock.calls[0][0].criteria_scores).toEqual({ X: 4 });
    expect(result.current.status).toBe('saved');
  });
});
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

const baseOpts = { instanceId: 'i1', reviewerId: 'u1', role: 'self' as const };

describe('useDebouncedResponseDraft — late-arriving initial (BUG-SELF-201091)', () => {
  beforeEach(() => { (svc.upsertResponseDraft as any).mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('re-seeds draft when initial transitions from null → fetched response', () => {
    const { result, rerender } = renderHook(
      ({ initial }: any) => useDebouncedResponseDraft({ ...baseOpts, initial }),
      { wrapper, initialProps: { initial: null } },
    );

    expect(result.current.draft.criteria_scores).toEqual({});
    expect(result.current.draft.notes).toBeNull();

    rerender({
      initial: {
        id: 'r1', updated_at: 't1',
        criteria_scores: { X: 5 }, qualitative_responses: { Q: 'yes' },
        evidence: [], weighted_score: 4.2, notes: 'hello',
      } as any,
    });

    expect(result.current.draft.criteria_scores).toEqual({ X: 5 });
    expect(result.current.draft.qualitative_responses).toEqual({ Q: 'yes' });
    expect(result.current.draft.notes).toBe('hello');
    expect(result.current.draft.weighted_score).toBe(4.2);
    expect(result.current.status).toBe('idle');
  });

  it('does NOT clobber pending local edits when initial arrives / refetches', () => {
    const initial = {
      id: 'r1', updated_at: 't1',
      criteria_scores: { X: 5 }, qualitative_responses: {},
      evidence: [], weighted_score: null, notes: null,
    } as any;

    const { result, rerender } = renderHook(
      ({ initial }: any) => useDebouncedResponseDraft({ ...baseOpts, initial }),
      { wrapper, initialProps: { initial } },
    );

    // User edits locally — status becomes 'pending'.
    act(() => { result.current.setDraft((p) => ({ ...p, criteria_scores: { X: 3 } })); });
    expect(result.current.status).toBe('pending');

    // Refetch returns a NEWER row (updated_at bumped) — must NOT overwrite the edit.
    rerender({ initial: { ...initial, updated_at: 't2', criteria_scores: { X: 5 } } });

    expect(result.current.draft.criteria_scores).toEqual({ X: 3 });
    expect(result.current.status).toBe('pending');
  });

  it('same initial key on rerender does not re-seed (no thrash)', () => {
    const initial = {
      id: 'r1', updated_at: 't1',
      criteria_scores: { X: 5 }, qualitative_responses: {}, evidence: [],
      weighted_score: null, notes: null,
    } as any;

    const { result, rerender } = renderHook(
      ({ initial }: any) => useDebouncedResponseDraft({ ...baseOpts, initial }),
      { wrapper, initialProps: { initial } },
    );

    act(() => { result.current.setDraft((p) => ({ ...p, criteria_scores: { X: 2 } })); });
    rerender({ initial: { ...initial } }); // same id + updated_at
    expect(result.current.draft.criteria_scores).toEqual({ X: 2 });
  });
});

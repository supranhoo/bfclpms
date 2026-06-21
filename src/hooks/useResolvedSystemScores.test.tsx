import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useResolvedSystemScores } from './useResolvedSystemScores';
import type { AnnualReviewTemplate } from '@/types/annualReview';

vi.mock('@/services/annualReview/carryKraScore', () => ({
  buildCarrySnapshot: vi.fn(async () => ({
    value: 99,
    maxValue: 100,
    rating: 4.95,
    monthly: [],
    fiscal_year: 2025,
    config: { aggregation: 'overall_avg', excludeNa: true },
    computed_at: '',
  })),
}));

const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const mkTpl = (sys: AnnualReviewTemplate['sections']['system_scores']): AnnualReviewTemplate => ({
  id: 't', name: 'T', is_active: true, created_at: '', updated_at: '',
  sections: { system_scores: sys, criteria: [], self_review_fields: [], eligibility_criteria: [] } as any,
} as AnnualReviewTemplate);

describe('useResolvedSystemScores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('overlays carry_kra value on top of persisted map', async () => {
    const tpl = mkTpl([
      { id: 'kra', name: 'KRA', weight: 100, source: 'carry_kra' } as any,
      { id: 'manual', name: 'Manual', weight: 0, source: 'manual' } as any,
    ]);
    const instance = { employee_id: 'emp-1', system_scores: { manual: 5 } };
    const { result } = renderHook(
      () => useResolvedSystemScores(tpl, instance as any, 2025),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.values.kra).toBe(99));
    expect(result.current.values.manual).toBe(5);
  });

  it('returns persisted map unchanged when no carry sources', async () => {
    const tpl = mkTpl([{ id: 'm', name: 'M', weight: 50, source: 'manual' } as any]);
    const { result } = renderHook(
      () => useResolvedSystemScores(tpl, { employee_id: 'e', system_scores: { m: 40 } } as any, 2025),
      { wrapper: wrapper() },
    );
    expect(result.current.values).toEqual({ m: 40 });
    expect(result.current.isLoading).toBe(false);
  });
});
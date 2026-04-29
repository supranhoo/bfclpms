import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useManualQuery,
  SAFETY_DEFAULT_PAGE_SIZE,
  SAFETY_PAGE_SIZE_OPTIONS,
} from '@/hooks/useManualQuery';

/**
 * Pure-logic tests for the Safety manual-fetch / pagination primitive
 * (POLICY §113 / ADR-050).
 */

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useManualQuery', () => {
  it('exposes 25/50/100 as the page-size options and 25 as default', () => {
    expect(SAFETY_DEFAULT_PAGE_SIZE).toBe(25);
    expect(SAFETY_PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
  });

  it('does not call fetcher until submit()', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { rows: [], total: 0 };
    };
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'test'], fetcher),
      { wrapper: wrap() },
    );
    expect(result.current.hasSubmitted).toBe(false);
    expect(calls).toBe(0);
  });

  it('computes range correctly for page/pageSize', async () => {
    const seen: Array<[number, number]> = [];
    const fetcher = async ({ range }: { range: [number, number] }) => {
      seen.push(range);
      return { rows: [], total: 200 };
    };
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'range'], fetcher, { pageSize: 25 }),
      { wrapper: wrap() },
    );
    await act(async () => {
      result.current.submit({ q: 'x' });
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(seen[0]).toEqual([0, 24]);

    await act(async () => result.current.setPage(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen[seen.length - 1]).toEqual([25, 49]);

    await act(async () => result.current.setPage(4));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen[seen.length - 1]).toEqual([75, 99]);
  });

  it('changing pageSize resets to page 1', async () => {
    const fetcher = async () => ({ rows: [], total: 100 });
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'reset'], fetcher),
      { wrapper: wrap() },
    );
    await act(async () => result.current.submit({ q: 'x' }));
    await act(async () => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    await act(async () => result.current.setPageSize(50));
    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);
  });

  it('rejects invalid page numbers (preserves prior page)', async () => {
    const fetcher = async () => ({ rows: [], total: 10 });
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'guard'], fetcher),
      { wrapper: wrap() },
    );
    await act(async () => result.current.submit({ q: 'x' }));
    await act(async () => result.current.setPage(0));
    expect(result.current.page).toBe(1);
    await act(async () => result.current.setPage(-5));
    expect(result.current.page).toBe(1);
  });

  it('reset() clears submitted state and disables fetching', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { rows: [], total: 0 };
    };
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'reset2'], fetcher),
      { wrapper: wrap() },
    );
    await act(async () => result.current.submit({ q: 'x' }));
    await new Promise((r) => setTimeout(r, 0));
    const before = calls;
    await act(async () => result.current.reset());
    expect(result.current.hasSubmitted).toBe(false);
    // No further calls after reset
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(before);
  });

  it('totalPages math handles partial last page', async () => {
    const fetcher = async () => ({ rows: [], total: 73 });
    const { result } = renderHook(
      () => useManualQuery<unknown, { q: string }>(['safety', 'pages'], fetcher, { pageSize: 25 }),
      { wrapper: wrap() },
    );
    await act(async () => result.current.submit({ q: 'x' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.totalPages).toBe(3); // ceil(73/25)
  });
});

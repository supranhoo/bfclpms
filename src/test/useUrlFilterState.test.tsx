import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import {
  useUrlFilterState,
  useUrlFilterStateNullable,
  useClearAllFilters,
  __resetUrlWriteCoalescerForTests,
  __getCoalescerWriteCountForTests,
} from '@/hooks/useUrlFilterState';

/**
 * Regression suite for the iOS-Safari history.replaceState throttle
 * hardening (ADR-073). Guards no-op short-circuiting, microtask
 * coalescing, and the 60-writes/10s rate-limit safety net.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useUrlFilterState — write coalescer & no-op guard', () => {
  beforeEach(() => {
    __resetUrlWriteCoalescerForTests();
  });
  afterEach(() => {
    __resetUrlWriteCoalescerForTests();
  });

  it('no-op guard: setting the same value emits no actual URL write', async () => {
    const { result } = renderHook(() => useUrlFilterState('q', ''), { wrapper });
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => {
      result.current[1](''); // empty == default, current is also empty
    });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline);
  });

  it('setting a new value produces exactly one history write', async () => {
    const { result } = renderHook(() => useUrlFilterState('q', ''), { wrapper });
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => {
      result.current[1]('hello');
    });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline + 1);
    expect(result.current[0]).toBe('hello');
  });

  it('nullable: repeated null clears emit no writes after the first', async () => {
    const { result } = renderHook(() => useUrlFilterStateNullable('dept'), { wrapper });
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => { result.current[1](null); });
    await flushMicrotasks();
    await act(async () => { result.current[1](null); });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline); // both were no-ops
  });

  it('coalesces multiple synchronous setter calls across hooks into one history write', async () => {
    const { result } = renderHook(
      () => ({
        q: useUrlFilterState('q', ''),
        dept: useUrlFilterStateNullable('dept'),
        desig: useUrlFilterStateNullable('desig'),
      }),
      { wrapper },
    );
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => {
      result.current.q[1]('alpha');
      result.current.dept[1]('eng');
      result.current.desig[1]('mgr');
    });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline + 1);
  });

  it('useClearAllFilters is a no-op when there is nothing to clear', async () => {
    const { result } = renderHook(() => useClearAllFilters(), { wrapper });
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => { result.current(); });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline);
  });

  it('200 distinct setter calls in one synchronous burst produce one history write', async () => {
    // The pathological iOS case: a runaway effect spamming the URL.
    // Coalescer must fold the whole burst into a single replaceState.
    const { result } = renderHook(() => useUrlFilterState('q', ''), { wrapper });
    const baseline = __getCoalescerWriteCountForTests();
    await act(async () => {
      for (let i = 0; i < 200; i++) result.current[1](`v${i}`);
    });
    await flushMicrotasks();
    expect(__getCoalescerWriteCountForTests()).toBe(baseline + 1);
    expect(result.current[0]).toBe('v199');
  });
});
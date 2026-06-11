import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNowTick } from '@/hooks/useNowTick';

describe('useNowTick (Phase 2 SLA live countdown)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('updates on the configured interval', () => {
    const { result } = renderHook(() => useNowTick(1000));
    const t0 = result.current.getTime();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.getTime()).toBeGreaterThan(t0);
  });

  it('is inert when intervalMs <= 0', () => {
    const { result } = renderHook(() => useNowTick(0));
    const t0 = result.current.getTime();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.getTime()).toBe(t0);
  });
});
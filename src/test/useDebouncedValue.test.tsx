import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the initial value synchronously on first render', () => {
    const { result } = renderHook(() => useDebouncedValue('alpha', 300));
    expect(result.current).toBe('alpha');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('a');
  });

  it('emits only the latest value after the delay', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    rerender({ v: 'abc' });
    rerender({ v: 'abcd' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('abcd');
  });

  it('respects a custom delay', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 1000),
      { initialProps: { v: 'x' } },
    );
    rerender({ v: 'y' });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('x');
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('y');
  });

  it('cleans up timers on unmount (no late update)', () => {
    const { rerender, unmount, result } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 1 } },
    );
    rerender({ v: 2 });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    // value frozen at last render
    expect(result.current).toBe(1);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsTablet, TABLET_BREAKPOINT_MIN, TABLET_BREAKPOINT_MAX } from '@/hooks/use-tablet';

/**
 * ADR-170 · POLICY §UX-TABLET-BREAKPOINT-CONTRACT.
 * Locks the [768, 1280) tablet band. Regressing these boundaries would push
 * tablet users back onto the dense desktop table or steal their layout onto
 * the mobile card list.
 */

type Listener = () => void;

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  const listeners: Listener[] = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (_: string, l: Listener) => listeners.push(l),
    removeEventListener: () => {},
    addListener: (l: Listener) => listeners.push(l),
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('useIsTablet — breakpoint contract', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('returns false just below the min (767)', () => {
    mockViewport(767);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);
  });

  it('returns true at the min (768)', () => {
    mockViewport(TABLET_BREAKPOINT_MIN);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });

  it('returns true just below the max (1279)', () => {
    mockViewport(TABLET_BREAKPOINT_MAX - 1);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });

  it('returns false at the max (1280) — desktop untouched', () => {
    mockViewport(TABLET_BREAKPOINT_MAX);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);
  });
});
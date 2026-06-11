import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEmergencySiren } from '@/hooks/useEmergencySiren';

class MockOscillator {
  frequency = { value: 0, setValueAtTime: vi.fn() };
  type = 'sine';
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class MockGain {
  gain = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}
class MockCtx {
  state = 'running';
  currentTime = 0;
  destination = {};
  createOscillator = () => new MockOscillator();
  createGain = () => new MockGain();
  close = vi.fn().mockImplementation(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
}

describe('useEmergencySiren', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockCtx;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('reports supported and toggles playback', () => {
    const { result } = renderHook(() => useEmergencySiren());
    expect(result.current.supported).toBe(true);
    expect(result.current.isPlaying).toBe(false);
    act(() => result.current.start());
    expect(result.current.isPlaying).toBe(true);
    act(() => result.current.stop());
    expect(result.current.isPlaying).toBe(false);
  });

  it('is inert when AudioContext is unavailable', () => {
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    const { result } = renderHook(() => useEmergencySiren());
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.isPlaying).toBe(false);
  });

  it('stops automatically on unmount', () => {
    const { result, unmount } = renderHook(() => useEmergencySiren());
    act(() => result.current.start());
    expect(result.current.isPlaying).toBe(true);
    unmount();
  });
});
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

describe('useUnsavedChanges', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not register beforeunload when clean', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChanges(false));
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('registers beforeunload when dirty', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChanges(true));
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('unregisters when dirty flips back to false', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderHook(({ dirty }: { dirty: boolean }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    rerender({ dirty: false });
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});
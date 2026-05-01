import { describe, it, expect, beforeEach } from 'vitest';
import { readPersistedThreshold } from './useRegistrySuggestions';

describe('readPersistedThreshold', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns fallback when key missing', () => {
    expect(readPersistedThreshold('missing.key', 0.55)).toBe(0.55);
  });

  it('returns persisted numeric value when present', () => {
    window.localStorage.setItem('k', '0.72');
    expect(readPersistedThreshold('k', 0.55)).toBe(0.72);
  });

  it('falls back when stored value is non-numeric', () => {
    window.localStorage.setItem('k', 'abc');
    expect(readPersistedThreshold('k', 0.55)).toBe(0.55);
  });

  it('falls back when stored value is below 0', () => {
    window.localStorage.setItem('k', '-0.1');
    expect(readPersistedThreshold('k', 0.55)).toBe(0.55);
  });

  it('falls back when stored value is above 1', () => {
    window.localStorage.setItem('k', '1.5');
    expect(readPersistedThreshold('k', 0.55)).toBe(0.55);
  });

  it('accepts boundary values 0 and 1', () => {
    window.localStorage.setItem('k', '0');
    expect(readPersistedThreshold('k', 0.55)).toBe(0);
    window.localStorage.setItem('k', '1');
    expect(readPersistedThreshold('k', 0.55)).toBe(1);
  });
});
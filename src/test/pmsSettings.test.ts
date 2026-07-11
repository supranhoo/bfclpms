import { describe, it, expect } from 'vitest';
import { parsePipThreshold, DEFAULT_PIP_THRESHOLD } from '@/lib/pmsSettings';

describe('parsePipThreshold', () => {
  it('returns default when value is null/undefined', () => {
    expect(parsePipThreshold(null)).toBe(DEFAULT_PIP_THRESHOLD);
    expect(parsePipThreshold(undefined)).toBe(DEFAULT_PIP_THRESHOLD);
  });

  it('parses raw numbers', () => {
    expect(parsePipThreshold(2.5)).toBe(2.5);
    expect(parsePipThreshold(4)).toBe(4);
  });

  it('parses numeric strings (system_settings JSON quoting)', () => {
    expect(parsePipThreshold('3.25')).toBe(3.25);
    expect(parsePipThreshold('"3.25"')).toBe(3.25);
  });

  it('clamps to 0..5', () => {
    expect(parsePipThreshold(-1)).toBe(0);
    expect(parsePipThreshold(9.9)).toBe(5);
  });

  it('falls back on garbage', () => {
    expect(parsePipThreshold('abc')).toBe(DEFAULT_PIP_THRESHOLD);
    expect(parsePipThreshold({} as unknown)).toBe(DEFAULT_PIP_THRESHOLD);
    expect(parsePipThreshold(NaN)).toBe(DEFAULT_PIP_THRESHOLD);
  });

  it('rounds to 2 decimals', () => {
    expect(parsePipThreshold(3.1415)).toBe(3.14);
  });
});
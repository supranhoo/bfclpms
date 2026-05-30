import { describe, it, expect } from 'vitest';
import { toPgArrayLiteral, exclusionKey } from './useIncrementEligibility';

describe('toPgArrayLiteral', () => {
  it('empty array → {}', () => {
    expect(toPgArrayLiteral([])).toBe('{}');
  });
  it('sorts ids deterministically', () => {
    expect(toPgArrayLiteral(['b', 'a', 'c'])).toBe('{a,b,c}');
  });
  it('single element', () => {
    expect(toPgArrayLiteral(['x'])).toBe('{x}');
  });
});

describe('exclusionKey', () => {
  it('joins employee id and assessment year with pipe', () => {
    expect(exclusionKey('emp-1', '2025-26')).toBe('emp-1|2025-26');
  });
  it('different AY → different key (per-AY semantics)', () => {
    expect(exclusionKey('emp-1', '2025-26')).not.toBe(exclusionKey('emp-1', '2026-27'));
  });
});
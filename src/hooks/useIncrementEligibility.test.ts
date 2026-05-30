import { describe, it, expect } from 'vitest';
import { toPgArrayLiteral } from './useIncrementEligibility';

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
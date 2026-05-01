import { describe, it, expect } from 'vitest';
import { validateAliasPartition } from './useDefinitionSplit';

describe('validateAliasPartition', () => {
  const all = ['a', 'b', 'c', 'd'];

  it('accepts a clean partition', () => {
    expect(validateAliasPartition(all, ['a', 'b'], ['c', 'd']).ok).toBe(true);
  });

  it('rejects empty move side', () => {
    const res = validateAliasPartition(all, ['a', 'b', 'c', 'd'], []);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/at least one alias/i);
  });

  it('rejects when total count does not match', () => {
    const res = validateAliasPartition(all, ['a'], ['b']);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/incomplete/i);
  });

  it('rejects overlap between sides (count tripwire fires first)', () => {
    // 3 + 2 = 5 vs 4 total — caught by the count check, which is correct:
    // any overlap by definition makes the totals diverge.
    const res = validateAliasPartition(all, ['a', 'b', 'c'], ['c', 'd']);
    expect(res.ok).toBe(false);
  });

  it('rejects same-size overlap (true duplicate path)', () => {
    // keep + move sums to total but `c` appears on both sides, with `d`
    // omitted entirely. Validates the duplicate-set guard.
    const res = validateAliasPartition(all, ['a', 'b', 'c'], ['c']);
    // Different message wording across the two failure paths is fine; we
    // only assert the rejection itself.
    expect(res.ok).toBe(false);
  });

  it('rejects unknown alias id', () => {
    const res = validateAliasPartition(all, ['a', 'b', 'x'], ['c', 'd']);
    expect(res.ok).toBe(false);
  });

  it('rejects orphan aliases', () => {
    // Total matches but `d` is missing and replaced by duplicate `a`
    // — caught by the duplicate check first.
    const res = validateAliasPartition(all, ['a', 'b', 'a'], ['c', 'd']);
    expect(res.ok).toBe(false);
  });

  it('accepts move-all partition (keep empty)', () => {
    expect(validateAliasPartition(all, [], ['a', 'b', 'c', 'd']).ok).toBe(true);
  });
});

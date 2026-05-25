import { describe, it, expect } from 'vitest';
import { encodeCsv, decodeCsv, readUrlArrays, writeUrlArrays } from './bulkUrlState';

describe('bulkUrlState', () => {
  it('encodes empty arrays as null (param stripped)', () => {
    expect(encodeCsv([])).toBeNull();
  });

  it('roundtrips simple values', () => {
    expect(decodeCsv(encodeCsv(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);
  });

  it('roundtrips values containing comma and ampersand', () => {
    const input = ['Sales, North', 'R&D', 'plain'];
    expect(decodeCsv(encodeCsv(input))).toEqual(input);
  });

  it('reads multiple keys at once and defaults to empty arrays', () => {
    const out = readUrlArrays('?cats=A,B&kras=', ['cats', 'kras', 'missing']);
    expect(out.cats).toEqual(['A', 'B']);
    expect(out.kras).toEqual([]);
    expect(out.missing).toEqual([]);
  });

  it('writes and strips empty arrays from the query string', () => {
    const qs = writeUrlArrays('', { cats: ['x'], kras: [] });
    expect(qs).toBe('?cats=x');
  });

  it('preserves unrelated existing params', () => {
    const qs = writeUrlArrays('?other=keep', { cats: ['a'] });
    expect(qs).toContain('other=keep');
    expect(qs).toContain('cats=a');
  });
});
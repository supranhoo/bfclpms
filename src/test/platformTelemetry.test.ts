import { describe, it, expect } from 'vitest';
import { aggregateByKey, toCsv } from '@/pages/platform/PlatformSettings';

describe('aggregateByKey', () => {
  it('returns descending counts grouped by key', () => {
    const rows = [{ k: 'a' }, { k: 'a' }, { k: 'b' }];
    expect(aggregateByKey(rows, 'k')).toEqual([
      { key: 'a', count: 2 },
      { key: 'b', count: 1 },
    ]);
  });

  it('treats null/undefined as "—"', () => {
    const rows = [{ k: null }, { k: undefined }, { k: 'x' }];
    const out = aggregateByKey(rows as Array<{ k: string | null | undefined }>, 'k');
    expect(out.find((r) => r.key === '—')?.count).toBe(2);
    expect(out.find((r) => r.key === 'x')?.count).toBe(1);
  });
});

describe('toCsv', () => {
  it('escapes commas, quotes and newlines per RFC 4180', () => {
    const csv = toCsv([{ a: 'hi, "you"', b: 'line\n2' }], ['a', 'b']);
    expect(csv).toBe('a,b\n"hi, ""you""","line\n2"');
  });
});
import { describe, it, expect } from 'vitest';
import { resolveKraDeletionIds, type KraSiblingRow } from '@/hooks/useKpis';

const rows: KraSiblingRow[] = [
  { id: 'nov25', review_period: 'November', review_year: 2025 },
  { id: 'dec25', review_period: 'December', review_year: 2025 },
  { id: 'jan26', review_period: 'January', review_year: 2026 },
  { id: 'jun26', review_period: 'June', review_year: 2026 },
  { id: 'jul26', review_period: 'July', review_year: 2026 },
];

describe('resolveKraDeletionIds', () => {
  it('month → only the current id', () => {
    const ids = resolveKraDeletionIds(rows, 'month', { id: 'jun26', period: 'June', year: 2026 });
    expect(ids).toEqual(['jun26']);
  });

  it('all → every sibling id regardless of date', () => {
    const ids = resolveKraDeletionIds(rows, 'all', { id: 'jun26', period: 'June', year: 2026 });
    expect(new Set(ids)).toEqual(new Set(rows.map((r) => r.id)));
  });

  it('from → current + strictly later, excludes earlier months', () => {
    const ids = resolveKraDeletionIds(rows, 'from', { id: 'jun26', period: 'June', year: 2026 });
    expect(new Set(ids)).toEqual(new Set(['jun26', 'jul26']));
  });

  it('from → boundary (current row is always included)', () => {
    const ids = resolveKraDeletionIds(rows, 'from', { id: 'jan26', period: 'January', year: 2026 });
    expect(new Set(ids)).toEqual(new Set(['jan26', 'jun26', 'jul26']));
  });

  it('from → cross-year: Dec 2025 pulls in Jan 2026, excludes Nov 2025', () => {
    const ids = resolveKraDeletionIds(rows, 'from', { id: 'dec25', period: 'December', year: 2025 });
    expect(new Set(ids)).toEqual(new Set(['dec25', 'jan26', 'jun26', 'jul26']));
  });
});
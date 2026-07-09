import { describe, it, expect } from 'vitest';
import { sortTemplateUsageRowsByName } from '@/pages/annual-review/AnnualReviewFormMapping';

describe('Templates in use — A-Z sort (Form Mapping)', () => {
  it('sorts templates alphabetically by name regardless of usage count', () => {
    const rows = [
      { id: 'tpl-1', name: 'Zulu - W', is_active: true as const, count: 500 },
      { id: 'tpl-2', name: 'Alpha - M', is_active: true as const, count: 5 },
      { id: 'tpl-3', name: 'alpha - W', is_active: true as const, count: 100 },
      { id: 'tpl-4', name: 'Bravo - W', is_active: false as const, count: 249 },
    ];

    const sorted = sortTemplateUsageRowsByName(rows);

    expect(sorted.map((r) => r.name)).toEqual([
      'Alpha - M',
      'alpha - W',
      'Bravo - W',
      'Zulu - W',
    ]);
  });

  it('does not mutate the input array', () => {
    const rows = [
      { id: 'tpl-2', name: 'Beta', is_active: true as const, count: 1 },
      { id: 'tpl-1', name: 'Alpha', is_active: true as const, count: 2 },
    ];
    const originalNames = rows.map((r) => r.name);

    sortTemplateUsageRowsByName(rows);

    expect(rows.map((r) => r.name)).toEqual(originalNames);
  });
});

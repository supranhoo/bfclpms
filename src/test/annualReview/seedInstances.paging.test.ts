import { describe, it, expect } from 'vitest';
import { fetchAllPaged } from '@/lib/fetchAll';

/**
 * Regression — RCA 2026-06-15 ("Seeded 1000 instances" cap).
 *
 * `seedInstancesByRules` / `seedInstancesForCycle` previously called
 * `supabase.from('profiles').select(...)` without `.range()`, which PostgREST
 * silently caps at 1000 rows. With ~2,533 active employees the seeder
 * created only 1000 `annual_review_instances`. POLICY §94 mandates
 * `fetchAllPaged` for any profiles list read.
 *
 * This test locks in that the paged helper returns the full roster and
 * that an employee placed beyond row 1000 IS included.
 */

type Row = { id: string; reporting_manager_id: string | null };

describe('Annual Review seeder — profiles paging (POLICY §94)', () => {
  const ROSTER: Row[] = Array.from({ length: 2533 }, (_, i) => ({
    id: `emp-${i.toString().padStart(5, '0')}`,
    reporting_manager_id: i === 0 ? null : `emp-${(i - 1).toString().padStart(5, '0')}`,
  }));

  it('fetchAllPaged returns every active employee past the 1000-row cap', async () => {
    const all = await fetchAllPaged<Row>(async (from, to) => ({
      data: ROSTER.slice(from, to + 1),
      error: null,
    }));
    expect(all).toHaveLength(ROSTER.length);
    expect(all.find((p) => p.id === 'emp-01500')).toBeDefined();
    expect(all.find((p) => p.id === 'emp-02532')).toBeDefined();
  });

  it('a single unpaged fetch would have hidden 1,533 employees', () => {
    const capped = ROSTER.slice(0, 1000);
    expect(capped).toHaveLength(1000);
    expect(capped.find((p) => p.id === 'emp-01500')).toBeUndefined();
  });
});

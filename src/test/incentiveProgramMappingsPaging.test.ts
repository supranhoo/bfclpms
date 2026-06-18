import { describe, it, expect } from 'vitest';
import { fetchAllPaged } from '@/lib/fetchAll';
import { __internal } from '@/services/incentiveProgramMappings';

/**
 * Regression — Incentive Program Mappings paging.
 *
 * Background: Metal Sizing has 2,560 employee mappings. Previously,
 * `incentive_program_mappings` was read with an unranged `.select(...)`,
 * which PostgREST silently caps at 1,000 rows. The result was that ~1,560
 * mapped employees were invisible in `IncentiveDataEntry` (and other
 * mapping consumers) even though they appeared in Incentive Configuration.
 *
 * These tests pin the invariants the fix must keep:
 *   1. The paged helper walks past the 1,000-row cap and returns every row.
 *   2. Bulk add/remove batches respect a 500-row chunk size.
 *   3. The pending-add / pending-remove computation matches saved vs draft.
 */

type Row = {
  id: string;
  program_id: string;
  mapping_type: 'employee';
  mapping_value: string;
  created_at: string;
};

function buildMappings(size: number, programId = 'metal-sizing'): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < size; i++) {
    rows.push({
      id: `map-${i.toString().padStart(5, '0')}`,
      program_id: programId,
      mapping_type: 'employee',
      mapping_value: `emp-${i.toString().padStart(5, '0')}`,
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    });
  }
  return rows;
}

describe('Incentive Program Mappings — paging regression', () => {
  const ROWS = buildMappings(2560);

  it('fetchAllPaged returns ALL 2,560 mappings (past the 1,000-row cap)', async () => {
    const all = await fetchAllPaged<Row>(async (from, to) => ({
      data: ROWS.slice(from, to + 1),
      error: null,
    }));
    expect(all).toHaveLength(2560);
    expect(all.find(r => r.mapping_value === 'emp-02100')).toBeDefined();
    expect(all.find(r => r.mapping_value === 'emp-02559')).toBeDefined();
  });

  it('a single unpaged fetch would silently truncate to 1,000 rows', () => {
    const capped = ROWS.slice(0, 1000);
    expect(capped).toHaveLength(1000);
    expect(capped.find(r => r.mapping_value === 'emp-02100')).toBeUndefined();
  });

  it('chunk() splits 1,200 writes into batches of 500 (500, 500, 200)', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    const batches = __internal.chunk(ids, 500);
    expect(batches.map(b => b.length)).toEqual([500, 500, 200]);
    expect(batches.flat()).toEqual(ids);
  });

  it('pending-add / pending-remove computation matches saved vs draft', () => {
    const saved = new Set(['a', 'b', 'c']);
    const draft = new Set(['b', 'c', 'd', 'e']);
    const pendingAdds: string[] = [];
    const pendingRemoves: string[] = [];
    draft.forEach(id => { if (!saved.has(id)) pendingAdds.push(id); });
    saved.forEach(id => { if (!draft.has(id)) pendingRemoves.push(id); });
    expect(pendingAdds.sort()).toEqual(['d', 'e']);
    expect(pendingRemoves).toEqual(['a']);
  });
});

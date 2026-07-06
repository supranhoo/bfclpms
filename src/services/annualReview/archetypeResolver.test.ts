import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client BEFORE importing the module under test.
const rowsRef: { current: Array<{ review_year: number | null; review_period: string | null }> } = {
  current: [],
};

vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => Promise.resolve({ data: rowsRef.current, error: null })),
  };
  return {
    supabase: { from: vi.fn(() => chain) },
  };
});

import { countKraMonthsInAY } from './archetypeResolver';

describe('countKraMonthsInAY — fiscal-window guard (BUG-045)', () => {
  beforeEach(() => { rowsRef.current = []; });

  it('counts only rows whose (period, year) belong to the selected assessment cycle', async () => {
    // Assessment cycle 2025 = Jul 2025 .. Jun 2026
    rowsRef.current = [
      { review_year: 2025, review_period: 'July' },      // in cycle ✓
      { review_year: 2025, review_period: 'September' }, // in cycle ✓
      { review_year: 2026, review_period: 'April' },     // in cycle ✓
      { review_year: 2026, review_period: 'July' },      // BLEED — cycle 2026-27, must be dropped
      { review_year: 2025, review_period: 'January' },   // BLEED — cycle 2024-25, must be dropped
    ];
    const n = await countKraMonthsInAY('emp-1', 2025);
    expect(n).toBe(3);
  });

  it('deduplicates duplicate (period, year) buckets', async () => {
    rowsRef.current = [
      { review_year: 2025, review_period: 'July' },
      { review_year: 2025, review_period: 'July' },
      { review_year: 2025, review_period: 'August' },
    ];
    const n = await countKraMonthsInAY('emp-1', 2025);
    expect(n).toBe(2);
  });

  it('returns 0 when all rows are out-of-cycle', async () => {
    rowsRef.current = [
      { review_year: 2026, review_period: 'July' },
      { review_year: 2025, review_period: 'March' },
    ];
    const n = await countKraMonthsInAY('emp-1', 2025);
    expect(n).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { paginate, pageCount, applyDailyGridFilters, EMPTY_FILTERS } from '@/lib/incentiveGrid';

// Minimal stand-ins for the grid's reductions. Mirrors the inline reducers in
// ProductionDailyGrid.tsx so we can guarantee the invariant codified in
// POLICY.md §INCENTIVE-MAPPING-PAGING: Σ pageTotal across all pages == grandTotal.
type Emp = { id: string; full_name: string; employee_code: string; tons: number };
const rateOf = () => 100; // flat ₹100/ton
const totalOf = (e: Emp) => Math.round(e.tons * rateOf());
const grandOf = (rows: Emp[]) => rows.reduce((s, e) => s + totalOf(e), 0);

function makeRoster(n: number): Emp[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    full_name: `Emp ${i}`,
    employee_code: `C${i.toString().padStart(4, '0')}`,
    tons: (i % 10) + 0.5, // varying tons
  }));
}

describe('ProductionDailyGrid footer invariants', () => {
  const roster = makeRoster(123); // matches Metal Sizing / BFCL count

  it('Σ pageTotal across all pages equals filteredGrandTotal (no drift > ₹1)', () => {
    const pageSize = 50;
    const filtered = applyDailyGridFilters(roster as any[], EMPTY_FILTERS, () => 100);
    const grand = grandOf(filtered as any[]);
    const pages = pageCount(filtered.length, pageSize);
    let sumOfPages = 0;
    for (let p = 0; p < pages; p++) {
      const slice = paginate(filtered, p, pageSize) as any[];
      sumOfPages += grandOf(slice);
    }
    expect(Math.abs(sumOfPages - grand)).toBeLessThanOrEqual(1);
  });

  it('pageTotal is always ≤ filteredGrandTotal', () => {
    const filtered = applyDailyGridFilters(roster as any[], EMPTY_FILTERS, () => 100);
    const grand = grandOf(filtered as any[]);
    [10, 25, 50, 100, 200].forEach(size => {
      const pages = pageCount(filtered.length, size);
      for (let p = 0; p < pages; p++) {
        const slice = paginate(filtered, p, size) as any[];
        expect(grandOf(slice)).toBeLessThanOrEqual(grand);
      }
    });
  });

  it('reproduces the 50/123 page-slice ≈ 40.6% of grand (RCA 2026-06-19)', () => {
    const filtered = applyDailyGridFilters(roster as any[], EMPTY_FILTERS, () => 100);
    const grand = grandOf(filtered as any[]);
    const firstPage = paginate(filtered, 0, 50) as any[];
    const ratio = grandOf(firstPage) / grand;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.5);
  });
});
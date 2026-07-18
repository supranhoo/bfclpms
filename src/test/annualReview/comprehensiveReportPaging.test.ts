import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchAllRpcPaged } from '@/lib/fetchAll';

/**
 * Regression — Comprehensive Annual Review Report was capped at 1,000 rows
 * because `fetchComprehensiveReport` called `.rpc(...)` without a Range loop.
 * PostgREST enforces `db-max-rows = 1000` on RPC responses (POLICY §125,
 * ADR-094). Fix routes the call through `fetchAllRpcPaged` in
 * `src/lib/fetchAll.ts`.
 */

describe('Annual Review Comprehensive Report — RPC paging (POLICY §125)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/annualReview/comprehensiveReport.ts'),
    'utf-8',
  );

  it('fetchComprehensiveReport uses fetchAllRpcPaged', () => {
    expect(src).toMatch(/fetchAllRpcPaged<ComprehensiveRow>/);
  });

  it('paged RPC call chains .range(from, to)', () => {
    expect(src).toMatch(/\.rpc\('get_annual_review_comprehensive_report'[\s\S]{0,200}\.range\(from, to\)/);
  });

  it('must NOT keep the bare single-shot .rpc call that hit the 1,000-row cap', () => {
    // Any bare `await (supabase as any).rpc('get_annual_review_comprehensive_report', ...)`
    // (i.e. NOT wrapped in the paging factory) would reintroduce the cap.
    expect(src).not.toMatch(/await\s+\(supabase as any\)\.rpc\('get_annual_review_comprehensive_report'/);
  });

  it('paged fetch returns every row past the 1,000-row cap', async () => {
    const ROSTER = Array.from({ length: 2533 }, (_, i) => ({
      instance_id: `inst-${i.toString().padStart(5, '0')}`,
    }));
    const rows = await fetchAllRpcPaged<{ instance_id: string }>(async (from, to) => ({
      data: ROSTER.slice(from, to + 1),
      error: null,
    }));
    expect(rows).toHaveLength(2533);
    expect(rows.find((r) => r.instance_id === 'inst-01500')).toBeDefined();
    expect(rows.find((r) => r.instance_id === 'inst-02532')).toBeDefined();
  });

  it('a single unpaged fetch would have hidden 1,533 rows', () => {
    const capped = Array.from({ length: 2533 }, (_, i) => i).slice(0, 1000);
    expect(capped).toHaveLength(1000);
    expect(capped.find((n) => n === 1500)).toBeUndefined();
  });
});
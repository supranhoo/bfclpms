import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * POLICY §PERF-W1 — `useSentBackOrgKpiEmployees` must carry an explicit
 * cache configuration. The hook fires once per Org KPI row on the Org KPI
 * Data Entry page; without these guards the same (categoryId, kra, kpi,
 * period, year) tuple was re-fetched on every render/focus and produced
 * 71,317 calls to the kpis duplicate-shape query in the 18-Jun-2026
 * pg_stat_statements audit. Sent-back state only changes via reviewer
 * actions that invalidate the key explicitly elsewhere, so a multi-minute
 * staleTime is safe.
 */
describe('useSentBackOrgKpiEmployees cache config', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/hooks/useSentBackOrgKpiEmployees.ts'),
    'utf-8',
  );

  it('declares staleTime of at least 5 minutes', () => {
    expect(src).toMatch(/staleTime:\s*5\s*\*\s*60_?000/);
  });

  it('declares gcTime of at least 10 minutes', () => {
    expect(src).toMatch(/gcTime:\s*10\s*\*\s*60_?000/);
  });

  it('disables refetchOnWindowFocus', () => {
    expect(src).toMatch(/refetchOnWindowFocus:\s*false/);
  });
});
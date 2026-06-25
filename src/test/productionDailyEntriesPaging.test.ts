import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// RCA SK130 (2026-06-25): `production_daily_entries` for an active program/
// month routinely exceeds the 1000-row PostgREST default cap (Metal Sizing
// June 2026 = 2,412 rows). An unranged `.select('*')` silently dropped
// employees whose rows sat past index 1,000, so saved values "disappeared"
// after refresh. This test pins the paged-read contract on the source so
// the hook can never regress to an unranged hydration query.
describe('useProductionDailyEntries — paged hydration (POLICY §INCENTIVE-MAPPING-PAGING)', () => {
  const src = fs.readFileSync('src/hooks/useProductionDailyEntries.ts', 'utf-8');

  it('imports fetchAllPaged', () => {
    expect(src).toMatch(/from\s+['"]@\/lib\/fetchAll['"]/);
    expect(src).toMatch(/fetchAllPaged/);
  });

  it('useProductionDailyEntries loads daily entries via fetchAllPaged + .range()', () => {
    const block = src.split('export function useProductionDailyEntries')[1]?.split('export function useBulkUpsertDailyEntries')[0] ?? '';
    expect(block, 'useProductionDailyEntries body not found').toBeTruthy();
    expect(block).toMatch(/fetchAllPaged/);
    expect(block).toMatch(/\.from\(['"]production_daily_entries['"]\)/);
    expect(block).toMatch(/\.range\(from,\s*to\)/);
    expect(block).toMatch(/\.order\(['"]employee_id['"]/);
  });

  it('does NOT embed profiles in the daily-entry select (PII hardening)', () => {
    const block = src.split('export function useProductionDailyEntries')[1]?.split('export function useBulkUpsertDailyEntries')[0] ?? '';
    expect(block).not.toMatch(/profiles\s*:/);
    expect(block).not.toMatch(/profiles\s*\(/);
  });

  it('keeps refetchOnWindowFocus disabled so background refocus cannot clobber typing', () => {
    const block = src.split('export function useProductionDailyEntries')[1]?.split('export function useBulkUpsertDailyEntries')[0] ?? '';
    expect(block).toMatch(/refetchOnWindowFocus:\s*false/);
  });
});
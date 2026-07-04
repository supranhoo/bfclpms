import { describe, it, expect } from 'vitest';

/**
 * Guards the fixed requirement (POLICY §KPI Weightage Governance):
 * For fiscal window starting Y, in-scope rows are exactly
 *   (review_year = Y   AND review_period IN Jul..Dec) UNION
 *   (review_year = Y+1 AND review_period IN Jan..Jun).
 *
 * Filtering by review_year alone leaks adjacent-fiscal-year rows and the
 * month-name-only matrix key then silently overwrites the correct cell.
 * These tests pin the predicate at three layers:
 *  1) The client fetch pairs each year with the correct month half.
 *  2) The source of useKpiWeightageMatrix carries the .in('review_period', …) call.
 *  3) The RPC migration text encodes the same window.
 */

import { readFileSync } from 'node:fs';

const FIRST_HALF = ['July','August','September','October','November','December'];
const SECOND_HALF = ['January','February','March','April','May','June'];

describe('KPI Weightage — fiscal-window predicate (Jul→Jun)', () => {
  it('halves cover 12 distinct months with no overlap', () => {
    expect(new Set([...FIRST_HALF, ...SECOND_HALF]).size).toBe(12);
    for (const m of FIRST_HALF) expect(SECOND_HALF).not.toContain(m);
  });

  it('in-scope predicate accepts current-fiscal rows and rejects sibling-fiscal rows', () => {
    const Y = 2025;
    const inScope = (year: number, month: string) =>
      (year === Y && FIRST_HALF.includes(month)) ||
      (year === Y + 1 && SECOND_HALF.includes(month));

    // Legit cells for AY 2025-26
    expect(inScope(2025, 'September')).toBe(true);   // Sep-25
    expect(inScope(2025, 'December')).toBe(true);    // Dec-25
    expect(inScope(2026, 'January')).toBe(true);     // Jan-26
    expect(inScope(2026, 'June')).toBe(true);        // Jun-26

    // Phantom cells that used to leak in
    expect(inScope(2026, 'July')).toBe(false);       // belongs to FY 2026-27
    expect(inScope(2026, 'August')).toBe(false);     // belongs to FY 2026-27
    expect(inScope(2026, 'September')).toBe(false);  // would have overwritten Sep-25
    expect(inScope(2025, 'January')).toBe(false);    // belongs to FY 2024-25
    expect(inScope(2025, 'June')).toBe(false);       // belongs to FY 2024-25
  });

  it('client hook source pins review_period IN (…) on the KPI fetch', () => {
    const src = readFileSync('src/hooks/useKpiWeightageMatrix.ts', 'utf8');
    // The predicate itself
    expect(src).toMatch(/FIRST_HALF_MONTHS\s*=\s*\[[^\]]*'July'[^\]]*'December'/);
    expect(src).toMatch(/SECOND_HALF_MONTHS\s*=\s*\[[^\]]*'January'[^\]]*'June'/);
    // The .in() must be threaded into fetchYear
    expect(src).toMatch(/\.in\(\s*'review_period'\s*,\s*monthNames/);
    // Both halves wired at the call site
    expect(src).toMatch(/fetchYear\(fiscalStartYear,\s*FIRST_HALF_MONTHS\)/);
    expect(src).toMatch(/fetchYear\(fiscalStartYear\s*\+\s*1,\s*SECOND_HALF_MONTHS\)/);
  });

  it('RPC migration encodes the same (year, month) window', () => {
    // Latest migration file for the weightage RPCs — find whichever ships the
    // fiscal-window predicate.
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const files = execSync(
      "grep -l 'rpc_weightage_variance_summary' supabase/migrations 2>/dev/null || true",
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    // Newest migration containing the RPC name is the source of truth.
    const latest = files.sort().reverse()[0];
    const sql = readFileSync(latest, 'utf8');
    expect(sql).toMatch(/review_period\s+IN\s*\(\s*'July'/i);
    expect(sql).toMatch(/review_period\s+IN\s*\(\s*'January'/i);
    expect(sql).toMatch(/review_year\s*=\s*p_fiscal_start_year\s*\+\s*1/);
  });
});

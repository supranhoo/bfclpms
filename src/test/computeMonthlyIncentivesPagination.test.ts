import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RCA 2026-06-29 (ADR-094) — Incentive Report for Metal Sizing / June 2026
 * understated by ₹87,151 vs the Data Entry Grid because
 * `compute-monthly-incentives` read `production_daily_entries` without
 * `.range()` pagination — PostgREST silently capped the result at 1,000
 * rows, dropping ~91 employees (including Pavan Gope, 1050 TPD).
 *
 * This test locks the contract that every multi-row read in
 * `compute-monthly-incentives/index.ts` MUST be paginated.
 */

const src = readFileSync(
  resolve(__dirname, '../../supabase/functions/compute-monthly-incentives/index.ts'),
  'utf-8',
);

function tableReadBlock(table: string): string {
  // Capture from `.from('<table>')` to the next blank line (block-local read).
  const re = new RegExp(`\\.from\\(['"]${table}['"]\\)[\\s\\S]*?(?=\\n\\s*\\n)`);
  const m = src.match(re);
  if (!m) throw new Error(`No read block found for ${table}`);
  return m[0];
}

describe('compute-monthly-incentives — paginated reads (ADR-094)', () => {
  it('production_daily_entries fetch is paginated via .range()', () => {
    const block = tableReadBlock('production_daily_entries');
    expect(block).toMatch(/\.range\(/);
  });

  it('incentive_production_rates fetch is paginated via .range()', () => {
    const block = tableReadBlock('incentive_production_rates');
    expect(block).toMatch(/\.range\(/);
  });

  it('employee_incentive_records override-probe is paginated via .range()', () => {
    // The override-probe block selects (employee_id, incentive_status, status_overridden_by).
    const idx = src.indexOf('status_overridden_by');
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 600), idx + 600);
    expect(window).toMatch(/\.range\(/);
  });

  it('exposes daily_entries_rows_loaded in diagnostics for observability', () => {
    expect(src).toMatch(/daily_entries_rows_loaded/);
    expect(src).toMatch(/production_rate_rows_loaded/);
  });

  it('every paginated loop breaks on a short page (no infinite loop)', () => {
    // Each PAGE = 1000 loop must contain `if (rows.length < PAGE) break;`
    const occurrences = src.match(/if \(rows\.length < PAGE\) break;/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4); // mappings + 3 new reads
  });
});
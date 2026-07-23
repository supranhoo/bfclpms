import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ADR-141 (2026-07-23) — Zero-out sub-period recompute.
 *
 * RCA: Compute previously skipped the delete-before-upsert block whenever
 * `scopedRecords.length === 0`. When a production sub-period (e.g. 11-20)
 * was corrected from a positive total down to zero, the loop emitted no
 * record for that sub-period, no delete ran, and the stale confirmed row
 * survived — so the Incentive Report continued to show the old amount
 * while the Incentive Data Entry grid showed zero.
 *
 * These tests lock the invariant that the delete step runs regardless of
 * whether new records will be inserted, uses the full employee roster,
 * and preserves paid rows.
 */

const src = readFileSync(
  resolve(__dirname, '../../supabase/functions/compute-monthly-incentives/index.ts'),
  'utf-8',
);

describe('compute-monthly-incentives — zero sub-period recompute (ADR-141)', () => {
  it('delete-before-upsert is NOT gated by scopedRecords.length > 0', () => {
    // The old guard wrapped the entire delete block. Ensure it's gone.
    const badGuard = /if\s*\(\s*scopedRecords\.length\s*>\s*0\s*\)\s*\{\s*[^}]*uniqueEmployeeIds/;
    expect(src).not.toMatch(badGuard);
  });

  it('affectedEmployeeIds is derived from the employees roster (not just scopedRecords)', () => {
    expect(src).toMatch(/affectedEmployeeIds/);
    expect(src).toMatch(/employees[\s\S]{0,80}map\(\(?e/);
  });

  it('delete step filters out paid rows (.neq status paid)', () => {
    // Both the scoped delete and legacy 'Full Month' delete must preserve paid records.
    const paidGuardMatches = src.match(/\.neq\(\s*['"]status['"]\s*,\s*['"]paid['"]\s*\)/g) || [];
    expect(paidGuardMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes rows_deleted_before_upsert diagnostic', () => {
    expect(src).toMatch(/rows_deleted_before_upsert/);
  });

  it('upsert only runs when scopedRecords.length > 0 (zero-record recompute is still valid)', () => {
    // Upsert block still guarded; delete block is not.
    expect(src).toMatch(/if\s*\(\s*scopedRecords\.length\s*>\s*0\s*\)\s*\{[\s\S]*?\.upsert\(/);
  });
});
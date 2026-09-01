import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ADR-338 — kpis.status is of enum type review_status. Comparing it to the
 * kpi_status vocabulary ('locked', 'approved_by_manager') raises
 * "invalid input value for enum review_status" at runtime.
 */
const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260901171810_c32c1a9c-b9d3-45f7-bdf3-022ad0919e14.sql',
);

const REVIEW_STATUS_VALUES = [
  'kra_set',
  'self_review',
  'manager_check',
  'functional_manager_check',
  'audit',
  'approved',
  'management_review',
  'skip_level_check',
  'hr_pms_review',
];

describe('KPI rename lock predicate (ADR-338)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('replaces both rename functions', () => {
    expect(sql).toContain('FUNCTION public.preview_kpi_range_correction');
    expect(sql).toContain('FUNCTION public.correct_kpis_range');
  });

  it('never compares kpis.status to kpi_status values', () => {
    const body = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(body).not.toMatch(/'locked'/);
    expect(body).not.toMatch(/'approved_by_manager'/);
  });

  it('uses only valid review_status literals against status', () => {
    const matches = [...sql.matchAll(/status::text\s*(?:<>|=)\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);
    for (const value of matches) {
      expect(REVIEW_STATUS_VALUES).toContain(value);
    }
  });

  it('derives the lock from the final score as well as the stage', () => {
    expect(sql).toMatch(/final_score IS NOT NULL OR .*status::text <> 'kra_set'/);
  });
});

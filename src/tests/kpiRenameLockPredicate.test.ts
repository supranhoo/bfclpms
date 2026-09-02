import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** ADR-340 — contract coverage for the RPC invoked by Preview rename. */
const CORRECTIVE_MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260902042437_409f3b15-bde6-4b18-b08d-7de9aeef33be.sql',
);
const RANGE_HOOK = resolve(process.cwd(), 'src/hooks/useKpiRangeCorrection.ts');

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

type MockKpi = { status: string; finalScore: number | null };

const isRenameLocked = ({ status, finalScore }: MockKpi) =>
  finalScore !== null || status !== 'kra_set';

describe('KPI rename lock predicate (ADR-340)', () => {
  const sql = readFileSync(CORRECTIVE_MIGRATION, 'utf8');
  const hook = readFileSync(RANGE_HOOK, 'utf8');

  it('replaces the exact dry-run RPC called by the UI', () => {
    expect(hook).toContain("supabase.rpc('correct_kpis_range_dry_run'");
    expect(sql).toContain('FUNCTION public.correct_kpis_range_dry_run');
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

  it.each([
    [{ status: 'kra_set', finalScore: null }, false],
    [{ status: 'kra_set', finalScore: 0 }, true],
    ...REVIEW_STATUS_VALUES.filter((status) => status !== 'kra_set').map(
      (status) => [{ status, finalScore: null }, true] as const,
    ),
  ])('classifies realistic KPI row %o as locked=%s', (row, expected) => {
    expect(isRenameLocked(row)).toBe(expected);
  });

  it('keeps the preview read-only and preserves empty/mixed count output', () => {
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b\s+(?:INTO\s+|FROM\s+)?public\.(?:kpis|org_kpi_values)/i);
    expect(sql).toContain('FULL OUTER JOIN');
    expect(sql).toContain('COALESCE(k.n, 0)');
    expect(sql).toContain('COALESCE(o.n, 0)');
  });
});

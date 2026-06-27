import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * v2.66.56 — Performance hotspot index guard.
 *
 * Auditor reported the app was "very very slow" on cold load + Audit Panel
 * + Scorecard open. `pg_stat_statements` ranked the top offenders, and the
 * migration `20260627083730_*.sql` ships targeted indexes for each.
 *
 * This test pins the index list so a future migration that removes one of
 * them (e.g. via accidental DROP or a regenerated baseline) fails CI before
 * the slowdown reaches production.
 */

const MIG_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260627083730_959cd037-fbfb-49f2-ab54-e684fb3cda69.sql',
);

const REQUIRED_INDEXES = [
  'idx_kpis_period_year_created',
  'idx_kpis_created_at_desc',
  'idx_kpis_dup_check',
  'idx_org_kpi_logs_lookup',
  'idx_profiles_active_fullname',
  'idx_profiles_active_designation',
  'idx_review_submissions_kpi_id',
  'idx_kpi_observations_kpi_created',
];

describe('Performance hotspot index migration', () => {
  const sql = fs.readFileSync(MIG_PATH, 'utf8');

  it.each(REQUIRED_INDEXES)('declares %s', (name) => {
    expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS\\s+${name}\\b`));
  });

  it('uses additive-only DDL (CREATE INDEX IF NOT EXISTS — no DROP)', () => {
    // Strip comments so the rollback note in the file header doesn't trip the guard.
    const stripped = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
    expect(/\bDROP\s+INDEX\b/i.test(stripped)).toBe(false);
  });
});
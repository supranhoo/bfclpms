/**
 * ADR-311 guard.
 *
 * `review_submissions.prior_final_rating` is TEXT while `final_rating` is the
 * `rating_level` enum. Mixing them inside COALESCE aborts the whole
 * `workflow_config` write with:
 *   "COALESCE types text and rating_level cannot be matched"
 *
 * This test binds the shipped SQL for `workflow_change_step_back()` to the
 * required cast so the regression cannot come back through a future migration.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function latestStepBackMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS_DIR, files[i]), 'utf8');
    if (sql.includes('FUNCTION public.workflow_change_step_back()')) return sql;
  }
  throw new Error('No migration defines workflow_change_step_back()');
}

describe('ADR-311 — workflow_change_step_back rating cast', () => {
  const sql = latestStepBackMigration();

  it('never COALESCEs the rating_level enum without casting it to text', () => {
    expect(sql).not.toMatch(/COALESCE\(\s*rs\.prior_final_rating\s*,\s*rs\.final_rating\s*\)/i);
  });

  it('snapshots the rating through an explicit ::text cast', () => {
    const casts = sql.match(
      /COALESCE\(\s*rs\.prior_final_rating\s*,\s*rs\.final_rating::text\s*\)/gi,
    );
    // terminal KPI branch + multi-month sibling branch
    expect(casts?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('restores the snapshot through an explicit enum cast', () => {
    expect(sql).toMatch(/final_rating\s*=\s*rs\.prior_final_rating::rating_level/i);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ADR-086 regression guard for repercolate_on_submission_update.
 *
 * Migrations are immutable (Migration Governance), so we assert on the
 * LATEST CREATE OR REPLACE of the function.
 *
 * Two invariants:
 *   Defect A — the status guard must accept either an approved KPI OR a
 *     submission with a non-NULL final_score (admin mid-transition edits).
 *   Defect B — the sibling lookup must NOT hard-code
 *     `AND k.review_year = v_kpi.review_year`, and must derive each sibling
 *     month's year from cycle position (wrapping cycles span two years).
 */
describe('repercolate_on_submission_update — ADR-086 invariants', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.repercolate_on_submission_update/i;
  const definers = files.filter((f) => fnRe.test(readFileSync(join(dir, f), 'utf8')));
  const latest = definers.at(-1)!;
  const body = readFileSync(join(dir, latest), 'utf8');

  it('a definition exists', () => {
    expect(definers.length).toBeGreaterThan(0);
  });

  it('Defect A: status guard accepts NEW.final_score IS NOT NULL', () => {
    // The guard should be `status != approved AND final_score IS NULL`,
    // NOT just `status != approved`.
    expect(body).toMatch(/status\s*!=\s*'approved'\s+AND\s+NEW\.final_score\s+IS\s+NULL/i);
  });

  it('Defect B: sibling JOIN does not hard-code review_year equality on kpis k', () => {
    // Look at the sibling SELECT block specifically.
    const siblingBlock = body.split(/FOR\s+v_sibling\s+IN/i)[1]?.split(/LOOP/i)[0] ?? '';
    expect(siblingBlock).not.toMatch(/k\.review_year\s*=\s*v_kpi\.review_year/i);
    // And it must derive years from cycle position
    expect(siblingBlock).toMatch(/v_kpi\.review_year\s*-\s*1/);
  });

  it('audit stamp uses POLICY_54_v5', () => {
    expect(body).toContain('POLICY_54_v5');
  });
});
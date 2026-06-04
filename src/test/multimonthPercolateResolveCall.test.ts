import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for BUG: Auditor submission failed on multi-month terminals
 * because percolate_multimonth_score() called a non-existent
 * `resolve_employee_workflow(...)` helper.
 *
 * Canonical helpers (per mem://architecture/database/per-employee-workflow-resolution):
 *   - get_employee_workflow_info(uuid, text, integer)
 *   - get_bulk_employee_workflows(uuid[], text, integer)
 *
 * Migrations are immutable (Migration Governance). This guard therefore checks
 * only the LATEST `CREATE OR REPLACE FUNCTION public.percolate_multimonth_score`
 * body — that is the currently-deployed contract.
 */
describe('multi-month percolation — workflow helper SSOT', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const fnRe = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.percolate_multimonth_score/i;
  const definers = files.filter((f) => fnRe.test(readFileSync(join(dir, f), 'utf8')));
  const latest = definers.at(-1);
  const latestBody = latest ? readFileSync(join(dir, latest), 'utf8') : '';

  it('a percolate_multimonth_score definition exists', () => {
    expect(definers.length).toBeGreaterThan(0);
  });

  it('latest percolate_multimonth_score does NOT reference phantom resolve_employee_workflow(', () => {
    expect(latestBody, `Phantom helper used in latest definition: ${latest}`)
      .not.toMatch(/\bresolve_employee_workflow\s*\(/);
  });

  it('latest percolate_multimonth_score uses get_employee_workflow_info', () => {
    expect(latestBody).toContain('get_employee_workflow_info');
  });
});
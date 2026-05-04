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
 * `resolve_employee_workflow(` is a forbidden phantom name and must never appear
 * in any committed migration.
 */
describe('multi-month percolation — workflow helper SSOT', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  it('no migration references the phantom resolve_employee_workflow(', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      if (/\bresolve_employee_workflow\s*\(/.test(src)) offenders.push(f);
    }
    expect(offenders, `Forbidden helper used in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('latest fix migration uses get_employee_workflow_info', () => {
    const fixFiles = files.filter((f) => /percolate|resolve_workflow|workflow_call/i.test(f));
    const anyHasCanonical = fixFiles.some((f) =>
      readFileSync(join(dir, f), 'utf8').includes('get_employee_workflow_info'),
    );
    expect(anyHasCanonical).toBe(true);
  });
});
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Regression guard: a SELECT policy on employee_incentive_records gated by
// has_menu_access_override(..., 'reports-incentive') MUST exist. Without it,
// users granted only the Incentive Report menu (e.g. Sandeep Kumar 200291,
// Upendra Singh) see zero records on /reports/incentive even though data
// exists.
describe('employee_incentive_records RLS — reports-incentive read access', () => {
  it('has a SELECT policy gated by reports-incentive menu access', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir).filter(f => f.endsWith('.sql'));
    const found = files.some(f => {
      const sql = readFileSync(join(dir, f), 'utf8');
      return /employee_incentive_records[\s\S]*FOR SELECT[\s\S]*reports-incentive/i.test(sql)
          || /reports-incentive[\s\S]*employee_incentive_records/i.test(sql);
    });
    expect(found).toBe(true);
  });
});
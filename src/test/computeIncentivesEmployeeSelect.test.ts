import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression — RCA 2026-05-29 (Incentive Report Saibal Kunar total wrong).
 *
 * The compute edge function previously built a global
 * `profiles.select('id, company_id')` lookup that PostgREST silently capped
 * at 1000 rows. Employees beyond that cap lost their direct company assignment
 * and the rate cascade fell back to dept→BU→division company, picking the
 * wrong rate (e.g. ₹490.62 instead of ₹503.39 for Saibal Kunar) for ~21
 * employees per period.
 *
 * This test locks in two contractual invariants on the edge function source:
 *   1. The per-employee `empSelect` MUST include `company_id`.
 *   2. The function MUST NOT issue an unpaginated global
 *      `profiles.select('id, company_id')` call.
 */
describe('compute-monthly-incentives — employee company_id contract', () => {
  const src = readFileSync(
    resolve(__dirname, '../../supabase/functions/compute-monthly-incentives/index.ts'),
    'utf8',
  );

  it('per-employee empSelect includes company_id', () => {
    const match = src.match(/const empSelect\s*=\s*'([^']+)'/);
    expect(match, 'empSelect string literal not found').not.toBeNull();
    expect(match![1]).toMatch(/\bcompany_id\b/);
  });

  it('does not perform a global profiles.select(\"id, company_id\") lookup', () => {
    // Forbid the exact pattern that hits the PostgREST 1000-row cap.
    expect(src).not.toMatch(/\.from\(\s*'profiles'\s*\)\s*\.\s*select\(\s*'id,\s*company_id'\s*\)/);
  });
});

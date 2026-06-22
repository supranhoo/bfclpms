import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RCA 2026-06-22 (Sandeep 200291 / Metal Sizing):
 * `useProductionRates()` previously embedded `profiles:employee_id(...)` in its
 * select. After PII hardening dropped the broad `profiles` SELECT policy for
 * non-admin Incentive Data Entry users, PostgREST returned zero rows for that
 * embedded query, which the data-entry grid mis-rendered as "No production
 * rates configured" — even though three company-tier rates existed.
 *
 * Lock the regression: the production-rates hook must NOT embed `profiles`.
 * Employee names for the admin Production Rates tab are resolved separately
 * from the locally-loaded roster.
 */
describe('useProductionRates RLS-safe select shape', () => {
  const src = readFileSync(
    resolve(__dirname, '../hooks/useProductionDailyEntries.ts'),
    'utf-8',
  );

  it('does not embed a profiles join in the production-rates query', () => {
    expect(src).not.toMatch(/profiles:employee_id/);
    expect(src).not.toMatch(/\.select\([^)]*profiles\s*\(/);
  });
});
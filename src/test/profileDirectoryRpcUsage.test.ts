import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Audit 2026-06-22 (post-Sandeep / post-Sajid follow-up):
 *
 * The 2026-06-22 PII hardening migration dropped the broad profile SELECT
 * policies for Org KPI Data Owners, Value Enterers, and Incentive Data Entry
 * users. Any feature reachable by those roles that previously read from
 * `public.profiles` directly silently returned zero rows — manifesting as
 * "Unknown" employee names, broken @mention search, and the Sandeep 200291
 * Metal Sizing empty-grid bug.
 *
 * Remediation contract: these hooks MUST resolve profile names through the
 * SECURITY DEFINER directory RPC `get_profile_directory_entries(_ids)` (or
 * `get_incentive_program_employees` for program-scoped lookups), never via a
 * direct `.from('profiles')` read. This test locks that contract so the
 * regression cannot return on a future refactor.
 */

const HOOKS = [
  '../hooks/useIncentiveVesselRates.ts',
  '../hooks/useVesselMonthlyEntries.ts',
  '../hooks/useSentBackOrgKpiEmployees.ts',
  '../hooks/useIncentiveRecords.ts',
  '../lib/incentiveExportData.ts',
  '../components/incentive/IncentiveDataExport.tsx',
];

describe('PII-hardened profile lookups via directory RPC', () => {
  for (const rel of HOOKS) {
    const src = readFileSync(resolve(__dirname, rel), 'utf-8');

    it(`${rel} uses get_profile_directory_entries instead of direct profiles SELECT`, () => {
      expect(src).toMatch(/get_profile_directory_entries/);
      // Allow .from('profiles') to disappear entirely; if any survives it must
      // not be a name/employee_code lookup that the dropped policies covered.
      const directNameLookup = /\.from\(['"]profiles['"]\)[\s\S]{0,200}select\([^)]*full_name/;
      expect(directNameLookup.test(src)).toBe(false);
    });
  }

  it('useMentionSearch routes @mention lookups through the directory RPC when a KPI context is set', () => {
    const src = readFileSync(
      resolve(__dirname, '../hooks/useMentionSearch.ts'),
      'utf-8',
    );
    expect(src).toMatch(/get_profile_directory_entries/);
    expect(src).toMatch(/get_kpi_accessible_user_ids/);
  });
});
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RCA 2026-06-26 (v2.66.55) — Incentive Report + Data Entry blank for
 * non-admin users (Upendra, Sandeep) when filtering by Programme + Company.
 *
 * Root cause: `MonthlyIncentiveTable`, `useIncentiveReportData`,
 * `useIncentiveReportParity`, `VesselDataEntryGrid`, and the vessel export
 * path all relied (directly or via embeds) on the `profiles` table or the
 * RLS-fragile `employeeCompanyMap` from `useCompanyFilter`. After PII
 * hardening (2026-06-22) non-admin operational users see only a partial
 * `profiles` slice, so the company filter dropped every row.
 *
 * These tests lock the SSOT contract:
 *   - Company filtering MUST come from the SECURITY DEFINER RPC
 *     `get_incentive_program_employees` (pre-resolved `company_id`) or from
 *     `profiles.company_id` returned by `get_profile_directory_entries_v2`.
 *   - No incentive feature may rely on `employeeCompanyMap` from
 *     `useCompanyFilter` for company filtering.
 *   - No incentive feature may embed `profiles:employee_id(...)` directly
 *     in the records-table read.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');

describe('Incentive Report / Data Entry — RLS-safe company filter SSOT', () => {
  it('MonthlyIncentiveTable filters records via roster RPC company_id, not useCompanyFilter map', () => {
    const src = read('../components/incentive/MonthlyIncentiveTable.tsx');
    expect(src).toMatch(/useIncentiveProgramRoster/);
    expect(src).toMatch(/rosterCompanyMap/);
    expect(src).toMatch(/r\.profiles\?\.company_id/);
    // `employeeCompanyMap` must no longer flow into the records filter.
    expect(src).not.toMatch(/employeeCompanyMap\.get\(r\.employee_id\)/);
  });

  it('useIncentiveReportData drops direct profile embed and enriches via directory RPC', () => {
    const src = read('../hooks/useIncentiveRecords.ts');
    expect(src).not.toMatch(/profiles:employee_id\(full_name/);
    expect(src).toMatch(/get_profile_directory_entries_v2/);
  });

  it('useIncentiveReportParity resolves company via get_incentive_program_employees', () => {
    const src = read('../hooks/useIncentiveReportParity.ts');
    expect(src).toMatch(/get_incentive_program_employees/);
    expect(src).not.toMatch(/employeeCompanyMap\.get/);
  });

  it('VesselDataEntryGrid filters by RPC-resolved profile.company_id when selectedCompanyId is set', () => {
    const src = read('../components/incentive/VesselDataEntryGrid.tsx');
    expect(src).toMatch(/selectedCompanyId\?:\s*string/);
    expect(src).toMatch(/r\.profile\?\.company_id === selectedCompanyId/);
  });

  it('useVesselRates enriches profiles through the v2 directory RPC', () => {
    const src = read('../hooks/useIncentiveVesselRates.ts');
    expect(src).toMatch(/get_profile_directory_entries_v2/);
  });

  it('IncentiveDataExport vessel path filters by selectedCompanyId via roster RPC', () => {
    const src = read('../components/incentive/IncentiveDataExport.tsx');
    expect(src).toMatch(/exportVesselData\([^)]*selectedCompanyId/);
    expect(src).toMatch(/get_incentive_program_employees/);
  });

  it('compute-monthly-incentives guards against zero-mapping leaking all employees', () => {
    const src = read('../../supabase/functions/compute-monthly-incentives/index.ts');
    expect(src).toMatch(/This programme has no employee mappings/);
  });
});
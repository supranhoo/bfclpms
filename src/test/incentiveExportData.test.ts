import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveMappedEmployeeIds,
  buildRateLookup,
  daysIn,
  __internal,
} from '@/lib/incentiveExportData';
import { resolveEmployeeRate } from '@/lib/incentiveRateResolver';

const { chunk } = __internal;

describe('incentiveExportData helpers', () => {
  it('chunk batches large id lists', () => {
    const ids = Array.from({ length: 2600 }, (_, i) => `id-${i}`);
    const batches = chunk(ids, 500);
    expect(batches.length).toBe(6);
    expect(batches[0].length).toBe(500);
    expect(batches[5].length).toBe(100);
  });

  it('buildRateLookup prefers employee rate, falls back to common', () => {
    const { empRates, commonRate } = buildRateLookup([
      { employee_id: null, entity_id: null, rate_per_ton: 12, rate_type: 'common' },
      { employee_id: 'e1', entity_id: null, rate_per_ton: 20, rate_type: 'employee' },
    ]);
    expect(commonRate).toBe(12);
    expect(empRates.get('e1')).toBe(20);
    expect(empRates.get('e2')).toBeUndefined();
  });

  it('daysIn returns correct month length (leap year Feb 2024)', () => {
    expect(daysIn('February', 2024)).toBe(29);
    expect(daysIn('February', 2025)).toBe(28);
    expect(daysIn('June', 2026)).toBe(30);
  });

  it('resolveMappedEmployeeIds matches direct employee + department cascade', () => {
    const mappings = [
      { id: '1', program_id: 'p', mapping_type: 'employee' as const, mapping_value: 'emp-A', created_at: '' },
      { id: '2', program_id: 'p', mapping_type: 'department' as const, mapping_value: 'dept-1', created_at: '' },
      { id: '3', program_id: 'p', mapping_type: 'business_unit' as const, mapping_value: 'bu-1', created_at: '' },
    ];
    const profiles = [
      { id: 'emp-A', full_name: 'A', employee_code: '1', designation: null, department_id: null },
      { id: 'emp-B', full_name: 'B', employee_code: '2', designation: null, department_id: 'dept-1' },
      { id: 'emp-C', full_name: 'C', employee_code: '3', designation: null, department_id: 'dept-2' },
      { id: 'emp-D', full_name: 'D', employee_code: '4', designation: null, department_id: 'dept-99' },
    ];
    const departments = [
      { id: 'dept-1', business_unit_id: null },
      { id: 'dept-2', business_unit_id: 'bu-1' },
      { id: 'dept-99', business_unit_id: 'bu-other' },
    ];
    const businessUnits = [
      { id: 'bu-1', division_id: null },
      { id: 'bu-other', division_id: null },
    ];
    const ids = resolveMappedEmployeeIds(mappings, profiles, departments, businessUnits);
    expect(ids.has('emp-A')).toBe(true); // direct
    expect(ids.has('emp-B')).toBe(true); // dept-1
    expect(ids.has('emp-C')).toBe(true); // bu-1 → dept-2
    expect(ids.has('emp-D')).toBe(false);
    expect(ids.size).toBe(3);
  });

  it('resolveMappedEmployeeIds resolves division → BU → department cascade', () => {
    const mappings = [
      { id: '1', program_id: 'p', mapping_type: 'division' as const, mapping_value: 'div-1', created_at: '' },
    ];
    const profiles = [
      { id: 'e1', full_name: '', employee_code: '', designation: null, department_id: 'dept-1' },
      { id: 'e2', full_name: '', employee_code: '', designation: null, department_id: 'dept-other' },
    ];
    const departments = [
      { id: 'dept-1', business_unit_id: 'bu-1' },
      { id: 'dept-other', business_unit_id: 'bu-other' },
    ];
    const businessUnits = [
      { id: 'bu-1', division_id: 'div-1' },
      { id: 'bu-other', division_id: 'div-2' },
    ];
    const ids = resolveMappedEmployeeIds(mappings, profiles, departments, businessUnits);
    expect(ids.has('e1')).toBe(true);
    expect(ids.has('e2')).toBe(false);
  });

  it('resolveMappedEmployeeIds returns empty when there are zero mappings', () => {
    // Regression: Metal Sizing program for Bihar Foundry & Casting had no
    // mappings, but the export previously surfaced every employee with a
    // saved daily entry. The roster must be empty when the program has no
    // mappings, so the export mirrors the on-screen grid.
    const ids = resolveMappedEmployeeIds(
      [],
      [
        { id: 'e1', full_name: 'X', employee_code: '1', designation: null, department_id: 'd1' },
      ],
      [{ id: 'd1', business_unit_id: null }],
      [],
    );
    expect(ids.size).toBe(0);
  });
});

describe('Incentive Data Entry export — RCA 2026-06-26 (Upendra / Metal Sizing)', () => {
  const exportSrc = readFileSync(
    resolve(__dirname, '../lib/incentiveExportData.ts'),
    'utf8',
  );
  const componentSrc = readFileSync(
    resolve(__dirname, '../components/incentive/IncentiveDataExport.tsx'),
    'utf8',
  );

  it('export resolver sources mapped roster from get_incentive_program_employees RPC', () => {
    // Server-authoritative roster mirrors ProductionDailyGrid — RLS-agnostic.
    expect(exportSrc).toMatch(/supabase\.rpc\(\s*['"]get_incentive_program_employees['"]/);
  });

  it('export resolver does not rely on filterByCompany when selectedCompanyId is provided', () => {
    expect(exportSrc).toMatch(/selectedCompanyId\?:\s*string/);
    expect(exportSrc).toMatch(/e\.company_id === selectedCompanyId/);
  });

  it('export resolver uses canonical resolveEmployeeRate cascade (employee → dept → BU → company → common)', () => {
    expect(exportSrc).toMatch(/resolveEmployeeRate\s*\(/);
    // effective_from must be selected so the cascade is date-aware.
    expect(exportSrc).toMatch(/effective_from/);
  });

  it('Download button wiring passes selectedCompanyId to the export', () => {
    expect(componentSrc).toMatch(/selectedCompanyId\?:\s*string/);
    expect(componentSrc).toMatch(/selectedCompanyId,\s*\n?\s*filterByCompany/);
    const unifiedSrc = readFileSync(
      resolve(__dirname, '../components/incentive/UnifiedProductionDataTab.tsx'),
      'utf8',
    );
    expect(unifiedSrc).toMatch(/selectedCompanyId=\{selectedCompanyId\}/);
  });

  it('canonical cascade resolves Metal Sizing-style company-only rates for Bihar employees', () => {
    // Reproduces Upendra's scenario at the helper level: program has a
    // single company-level rate (no employee/dept/BU rate). Before the fix
    // the export used `empRates.get(id) ?? commonRate` and produced rate=0;
    // the canonical cascade returns the configured company rate.
    const BIHAR = 'company-bihar';
    const rates = [
      {
        rate_type: 'company' as const,
        entity_id: BIHAR,
        employee_id: null,
        rate_per_ton: 490.62,
        effective_from: '2026-05-11',
      },
    ];
    const r = resolveEmployeeRate('emp-1', 'dept-1', 'bu-1', rates, BIHAR, '2026-06-01');
    expect(r.source).toBe('company');
    expect(r.rate).toBe(490.62);

    // Sanity: legacy `buildRateLookup` would have returned 0 here (no
    // 'employee' or 'common' rows), proving the regression class.
    const { empRates, commonRate } = buildRateLookup(rates as any);
    expect(empRates.get('emp-1')).toBeUndefined();
    expect(commonRate).toBe(0);
  });
});
import { describe, it, expect } from 'vitest';
import {
  resolveMappedEmployeeIds,
  buildRateLookup,
  daysIn,
  __internal,
} from '@/lib/incentiveExportData';

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
});
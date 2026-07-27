import { describe, it, expect } from 'vitest';
import { applyEmployeeStatusFilter } from '@/lib/reportEmployeeFilter';

/** ADR-177 — KPI Status Tracker employee active/inactive scoping. */
const rows = [
  { kpiId: 'k1', employeeName: 'Active Ann',    isActive: true },
  { kpiId: 'k2', employeeName: 'Inactive Ivan', isActive: false },
  { kpiId: 'k3', employeeName: 'Unknown Uma',   isActive: undefined as unknown as boolean },
];

describe('KpiStatusTracker employee status filter', () => {
  it('active mode excludes inactive employees', () => {
    const out = applyEmployeeStatusFilter(rows, 'active', r => r.isActive);
    expect(out.map(r => r.kpiId)).toEqual(['k1', 'k3']);
  });

  it('inactive mode keeps only inactive employees', () => {
    const out = applyEmployeeStatusFilter(rows, 'inactive', r => r.isActive);
    expect(out.map(r => r.kpiId)).toEqual(['k2']);
  });

  it('all mode keeps everything', () => {
    expect(applyEmployeeStatusFilter(rows, 'all', r => r.isActive)).toHaveLength(3);
  });

  it('treats an unknown flag as active (no silent data loss)', () => {
    const out = applyEmployeeStatusFilter(rows, 'active', r => r.isActive);
    expect(out.some(r => r.kpiId === 'k3')).toBe(true);
  });
});

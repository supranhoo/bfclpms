import { describe, it, expect } from 'vitest';
import { normalizeRole, KpiImportRowSchema } from './importValidation';

describe('normalizeRole', () => {
  it('returns employee for null/undefined', () => {
    expect(normalizeRole(null)).toBe('employee');
    expect(normalizeRole(undefined)).toBe('employee');
  });

  it('returns employee for empty string', () => {
    expect(normalizeRole('')).toBe('employee');
  });

  it('normalizes valid roles case-insensitively', () => {
    expect(normalizeRole('Admin')).toBe('admin');
    expect(normalizeRole('MANAGER')).toBe('manager');
    expect(normalizeRole('Employee')).toBe('employee');
    expect(normalizeRole('auditor')).toBe('auditor');
    expect(normalizeRole('Management')).toBe('management');
  });

  it('returns employee for invalid role', () => {
    expect(normalizeRole('superuser')).toBe('employee');
    expect(normalizeRole('xyz')).toBe('employee');
  });

  it('trims whitespace', () => {
    expect(normalizeRole('  admin  ')).toBe('admin');
  });
});

describe('KpiImportRowSchema', () => {
  const validRow = {
    newCode: 'EMP001',
    fullName: 'John Doe',
    category: 'Sales',
    kra: 'Revenue Generation',
    kpi: 'Monthly Sales Target',
  };

  it('passes for valid minimal row', () => {
    const result = KpiImportRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it('fails when required fields are missing', () => {
    const result = KpiImportRowSchema.safeParse({ newCode: 'EMP001' });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = KpiImportRowSchema.safeParse({
      ...validRow,
      target: 100,
      uom: '%',
      frequency: 'Monthly',
      kpiWeightage: 30,
    });
    expect(result.success).toBe(true);
  });

  it('fails for empty employee code', () => {
    const result = KpiImportRowSchema.safeParse({ ...validRow, newCode: '' });
    expect(result.success).toBe(false);
  });

  it('accepts string or number for target', () => {
    expect(KpiImportRowSchema.safeParse({ ...validRow, target: 100 }).success).toBe(true);
    expect(KpiImportRowSchema.safeParse({ ...validRow, target: '100%' }).success).toBe(true);
  });

  it('accepts isOrgLevel boolean conversion', () => {
    expect(KpiImportRowSchema.safeParse({ ...validRow, isOrgLevel: 'yes' }).success).toBe(true);
    expect(KpiImportRowSchema.safeParse({ ...validRow, isOrgLevel: 'true' }).success).toBe(true);
    expect(KpiImportRowSchema.safeParse({ ...validRow, isOrgLevel: '' }).success).toBe(true);
  });
});

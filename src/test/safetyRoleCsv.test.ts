import { describe, it, expect } from 'vitest';
import { parseRoleImportCsv, buildRoleExportCsv } from '@/lib/safetyRoleCsv';

describe('parseRoleImportCsv', () => {
  it('parses valid rows by employee_code or email', () => {
    const csv = `employee_code,email,role\nE001,,worker\n,jane@x.io,supervisor\n`;
    const r = parseRoleImportCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].role).toBe('worker');
    expect(r.rows[1].email).toBe('jane@x.io');
  });

  it('rejects unknown role', () => {
    const r = parseRoleImportCsv(`employee_code,email,role\nE1,,godmode\n`);
    expect(r.rows).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('requires employee_code or email per row', () => {
    const r = parseRoleImportCsv(`employee_code,email,role\n,,worker\n`);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].message).toMatch(/required/);
  });

  it('rejects missing header', () => {
    const r = parseRoleImportCsv(`employee_code,email\nE1,a@b.c\n`);
    expect(r.errors[0].message).toMatch(/role/);
  });

  it('dedupes identical (identifier, role) pairs', () => {
    const csv = `employee_code,email,role\nE001,,worker\nE001,,worker\n`;
    expect(parseRoleImportCsv(csv).rows).toHaveLength(1);
  });

  it('normalizes role casing', () => {
    const r = parseRoleImportCsv(`employee_code,email,role\nE1,,WORKER\n`);
    expect(r.rows[0].role).toBe('worker');
  });
});

describe('buildRoleExportCsv', () => {
  it('escapes commas and quotes', () => {
    const csv = buildRoleExportCsv([
      { employee_code: 'E1', email: 'a,b@x.io', role: 'worker', assigned_at: '2026-01-01' },
      { employee_code: null, email: 'q"u@x.io', role: 'supervisor', assigned_at: '2026-01-02' },
    ]);
    expect(csv.split('\n')[0]).toBe('employee_code,email,role,assigned_at');
    expect(csv).toContain('"a,b@x.io"');
    expect(csv).toContain('"q""u@x.io"');
  });
});
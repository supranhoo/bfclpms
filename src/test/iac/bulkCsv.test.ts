import { describe, it, expect } from 'vitest';
import { parseCsv, serializeCsv, validateBulkRow, templateCsv } from '@/lib/iac/csv';

describe('IAC bulk CSV utilities', () => {
  it('parses headers and rows, ignoring comments and blank lines', () => {
    const csv = '# comment\nemail,role_code\n\nfoo@example.com,pms_manager\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['email', 'role_code']);
    expect(rows).toEqual([{ email: 'foo@example.com', role_code: 'pms_manager' }]);
  });

  it('handles quoted fields with embedded commas, quotes and CRLF', () => {
    const csv = 'a,b\r\n"hello, ""world""","x"\r\n';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual({ a: 'hello, "world"', b: 'x' });
  });

  it('round-trips serialize -> parse for bulk export shape', () => {
    const rows = [
      { email: 'a@b.com', role_code: 'pms_manager', scope_type: 'global', scope_id: '', expires_at: '', assigned_at: '2026-04-30T00:00:00Z' },
      { email: 'c,d@e.com', role_code: 'safety_admin', scope_type: 'company', scope_id: 'co1', expires_at: '2026-12-31', assigned_at: '2026-04-29T00:00:00Z' },
    ];
    const headers = ['email', 'role_code', 'scope_type', 'scope_id', 'expires_at', 'assigned_at'] as const;
    const csv = serializeCsv(rows, headers as unknown as (keyof typeof rows[number])[]);
    const back = parseCsv(csv).rows;
    expect(back).toHaveLength(2);
    expect(back[0].email).toBe('a@b.com');
    expect(back[1].email).toBe('c,d@e.com');
    expect(back[1].scope_id).toBe('co1');
  });

  it('flags missing email, missing role, bad scope, bad date', () => {
    expect(validateBulkRow({ email: '', role_code: 'r' }, 1).issues).toContain('missing_email');
    expect(validateBulkRow({ email: 'x@y.com', role_code: '' }, 1).issues).toContain('missing_role');
    expect(validateBulkRow({ email: 'x@y.com', role_code: 'r', scope_type: 'xyz' }, 1).issues).toContain('bad_scope');
    expect(validateBulkRow({ email: 'x@y.com', role_code: 'r', expires_at: 'not-a-date' }, 1).issues).toContain('bad_date');
  });

  it('returns a valid row when everything checks out', () => {
    const r = validateBulkRow({ email: 'X@Y.com', role_code: 'pms_manager' }, 5);
    expect(r.issues).toEqual([]);
    expect(r.row).toEqual({
      email: 'x@y.com', role_code: 'pms_manager', scope_type: 'global', scope_id: null, expires_at: null,
    });
  });

  it('templateCsv parses cleanly and produces 1 example row', () => {
    const { headers, rows } = parseCsv(templateCsv());
    expect(headers).toEqual(['email', 'role_code', 'scope_type', 'scope_id', 'expires_at']);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('jane.doe@example.com');
  });
});
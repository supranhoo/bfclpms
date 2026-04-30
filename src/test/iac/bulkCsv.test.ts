import { describe, it, expect } from 'vitest';
import {
  parseCsv, serializeCsv, validateBulkRow, templateCsv,
  serializeMatrixCsv, matrixTemplateCsv, parseMatrixCsv, diffMatrix,
  isMatrixCellTruthy,
} from '@/lib/iac/csv';
import type { IacMatrixRow } from '@/services/iac/types';

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
describe('IAC role-matrix CSV utilities', () => {
  const ROLES = ['pms_admin', 'pms_manager', 'safety_officer'];

  it('matrix template lists all role columns and identity columns', () => {
    const csv = matrixTemplateCsv(ROLES);
    expect(csv).toContain('employee_code,email,full_name,is_active,pms_admin,pms_manager,safety_officer');
  });

  it('serialize -> parse round-trip preserves Y/blank cells', () => {
    const rows: IacMatrixRow[] = [
      { employee_code: 'E1', email: 'a@x.com', full_name: 'A', is_active: true,
        roles: { pms_admin: 'Y', pms_manager: '', safety_officer: 'Y' } },
      { employee_code: 'E2', email: 'b@x.com', full_name: 'B', is_active: true,
        roles: { pms_admin: '', pms_manager: 'Y', safety_officer: '' } },
    ];
    const csv = serializeMatrixCsv(ROLES, rows);
    const parsed = parseMatrixCsv(csv, ROLES);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].roles).toEqual({ pms_admin: 'Y', pms_manager: '', safety_officer: 'Y' });
    expect(parsed.rows[1].roles).toEqual({ pms_admin: '', pms_manager: 'Y', safety_officer: '' });
  });

  it('flags unknown role columns and unrecognised cell values', () => {
    const csv = 'email,pms_admin,bogus_role\nx@y.com,Y,Y\nz@y.com,maybe,\n';
    const parsed = parseMatrixCsv(csv, ROLES);
    expect(parsed.unknownRoleColumns).toContain('bogus_role');
    expect(parsed.errors.some((e) => /Unrecognised cell value/.test(e.reason))).toBe(true);
  });

  it('rejects a CSV with no email/employee_code header', () => {
    const parsed = parseMatrixCsv('full_name,pms_admin\nFoo,Y\n', ROLES);
    expect(parsed.errors[0].reason).toMatch(/email.*employee_code/);
  });

  it('isMatrixCellTruthy recognises Y/yes/1/true (case-insensitive) only', () => {
    ['Y', 'y', 'YES', 'true', '1'].forEach((v) => expect(isMatrixCellTruthy(v)).toBe(true));
    ['', 'N', 'no', '0', '-', 'maybe'].forEach((v) => expect(isMatrixCellTruthy(v)).toBe(false));
  });

  it('diffMatrix produces correct grant/revoke/unchanged buckets', () => {
    const parsed = parseMatrixCsv(
      'email,pms_admin,pms_manager,safety_officer\n' +
      'a@x.com,Y,,Y\n' + // a: keep admin, drop manager, add safety_officer
      'b@x.com,,Y,\n',   // b: drop admin? (had none), keep manager (had it), no safety
      ROLES,
    );
    const userByEmail = new Map([
      ['a@x.com', { id: 'u-a', full_name: 'A', is_active: true }],
      ['b@x.com', { id: 'u-b', full_name: 'B', is_active: true }],
    ]);
    const userByCode = new Map();
    const roleByCode = new Map([
      ['pms_admin', 'r-admin'], ['pms_manager', 'r-mgr'], ['safety_officer', 'r-so'],
    ]);
    const currentGlobal = new Map([
      ['u-a', new Map([['pms_admin', 'asg-a-admin'], ['pms_manager', 'asg-a-mgr']])],
      ['u-b', new Map([['pms_manager', 'asg-b-mgr']])],
    ]);
    const d = diffMatrix(parsed, userByEmail, userByCode, roleByCode, currentGlobal, false);
    expect(d.toGrant.map((g) => `${g.email}:${g.role_code}`).sort()).toEqual([
      'a@x.com:safety_officer',
    ]);
    expect(d.toRevoke.map((r) => `${r.email}:${r.role_code}`).sort()).toEqual([
      'a@x.com:pms_manager',
    ]);
    expect(d.errors).toEqual([]);
  });

  it('flags inactive users unless override is enabled', () => {
    const parsed = parseMatrixCsv('email,pms_admin\nx@y.com,Y\n', ROLES);
    const userByEmail = new Map([['x@y.com', { id: 'u-x', full_name: 'X', is_active: false }]]);
    const roleByCode = new Map([['pms_admin', 'r-admin']]);
    const strict = diffMatrix(parsed, userByEmail, new Map(), roleByCode, new Map(), false);
    expect(strict.errors[0].reason).toMatch(/inactive/i);
    const lenient = diffMatrix(parsed, userByEmail, new Map(), roleByCode, new Map(), true);
    expect(lenient.errors).toEqual([]);
    expect(lenient.toGrant).toHaveLength(1);
  });

  it('falls back to employee_code when email is blank', () => {
    const parsed = parseMatrixCsv('employee_code,email,pms_admin\nE99,,Y\n', ROLES);
    expect(parsed.errors).toEqual([]);
    const userByCode = new Map([['E99', { id: 'u-99', full_name: 'N', is_active: true, email: '' }]]);
    const roleByCode = new Map([['pms_admin', 'r-admin']]);
    const d = diffMatrix(parsed, new Map(), userByCode, roleByCode, new Map(), false);
    expect(d.toGrant).toHaveLength(1);
    expect(d.toGrant[0].user_id).toBe('u-99');
  });
});

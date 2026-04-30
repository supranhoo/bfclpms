/**
 * Minimal RFC-4180-ish CSV utilities for the IAC Bulk tab.
 * Zero external deps so the bundle stays lean.
 */
import type {
  IacBulkAssignmentRow,
  IacScopeType,
  ParsedBulkRow,
  BulkRowIssue,
  IacMatrixRow,
  IacMatrixDiff,
  IacMatrixRowError,
} from '@/services/iac/types';

const VALID_SCOPES: IacScopeType[] = ['global', 'company', 'business_unit', 'department'];

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function serializeCsv<T>(rows: T[], headers: (keyof T)[]): string {
  const head = headers.map((h) => escapeCell(String(h))).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell((r as Record<string, unknown>)[h as string])).join(',')).join('\r\n');
  return rows.length ? `${head}\r\n${body}\r\n` : `${head}\r\n`;
}

/** Parse CSV text. Skips blank lines and lines starting with '#'. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const cells: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        cells.push(row); row = [];
      } else { cur += c; }
    }
  }
  if (cur.length || row.length) { row.push(cur); cells.push(row); }

  // Strip blank lines and comment lines (first non-empty cell starts with #).
  const cleaned = cells.filter((r) => r.some((c) => c.trim() !== '') && !(r[0] ?? '').trim().startsWith('#'));
  if (cleaned.length === 0) return { headers: [], rows: [] };
  const headers = cleaned[0].map((h) => h.trim());
  const rows = cleaned.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { headers, rows };
}

export function validateBulkRow(raw: Record<string, string>, lineNo: number): ParsedBulkRow {
  const issues: BulkRowIssue[] = [];
  const email = (raw.email ?? '').toLowerCase();
  const role_code = raw.role_code ?? '';
  const scope_type = (raw.scope_type || 'global') as IacScopeType;
  const scope_id = raw.scope_id || null;
  const expires_at = raw.expires_at || null;

  if (!email) issues.push('missing_email');
  if (!role_code) issues.push('missing_role');
  if (!VALID_SCOPES.includes(scope_type)) issues.push('bad_scope');
  if (expires_at && Number.isNaN(Date.parse(expires_at))) issues.push('bad_date');

  const row: IacBulkAssignmentRow | null = issues.length === 0
    ? { email, role_code, scope_type, scope_id, expires_at }
    : null;
  return { raw, row, issues, lineNo };
}

export const BULK_HEADERS = ['email', 'role_code', 'scope_type', 'scope_id', 'expires_at'] as const;

export function templateCsv(): string {
  return [
    '# IAC bulk assignment template',
    '# scope_type must be one of: global, company, business_unit, department',
    '# scope_id is required when scope_type != global (UUID)',
    '# expires_at is optional ISO date (YYYY-MM-DD or full ISO timestamp)',
    'email,role_code,scope_type,scope_id,expires_at',
    'jane.doe@example.com,pms_manager,global,,',
    '',
  ].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function issueLabel(issue: BulkRowIssue): string {
  switch (issue) {
    case 'missing_email': return 'Email is required';
    case 'missing_role': return 'role_code is required';
    case 'bad_scope': return 'scope_type must be global | company | business_unit | department';
    case 'bad_date': return 'expires_at is not a valid date';
    case 'unknown_user': return 'No user matches this email';
    case 'unknown_role': return 'No role matches this code';
    case 'duplicate': return 'Assignment already exists';
  }
}

// =====================================================================
// Role-matrix CSV (one row per user × one column per role)
// =====================================================================

export const MATRIX_IDENTITY_COLS = ['employee_code', 'email', 'full_name', 'is_active'] as const;
export type MatrixIdentityCol = typeof MATRIX_IDENTITY_COLS[number];

/** Cell values that grant a role — case insensitive. Anything else = revoke/blank. */
const TRUTHY_CELLS = new Set(['y', 'yes', 'true', '1']);
/** Explicit revoke markers (treated like blank, no warning). */
const FALSY_CELLS = new Set(['', 'n', 'no', 'false', '0', '-']);

export function isMatrixCellTruthy(v: string): boolean {
  return TRUTHY_CELLS.has(String(v ?? '').trim().toLowerCase());
}
export function isMatrixCellRecognised(v: string): boolean {
  const t = String(v ?? '').trim().toLowerCase();
  return TRUTHY_CELLS.has(t) || FALSY_CELLS.has(t);
}

export function serializeMatrixCsv(roleCodes: string[], rows: IacMatrixRow[]): string {
  const headers = [...MATRIX_IDENTITY_COLS, ...roleCodes];
  const head = headers.map((h) => escapeCell(h)).join(',');
  const body = rows.map((r) => {
    const cells: string[] = [
      escapeCell(r.employee_code ?? ''),
      escapeCell(r.email),
      escapeCell(r.full_name ?? ''),
      escapeCell(r.is_active ? 'Y' : ''),
      ...roleCodes.map((rc) => escapeCell(r.roles[rc] === 'Y' ? 'Y' : '')),
    ];
    return cells.join(',');
  }).join('\r\n');
  const preamble = [
    '# IAC role-matrix template',
    '# One row per user. Cell value Y (case-insensitive) grants the role at scope_type=global.',
    '# Blank, N, or - revokes that role for the user.',
    '# Identity columns (employee_code,email,full_name,is_active) are read-only context.',
    '# Lookup precedence: email first, then employee_code.',
  ].join('\r\n');
  return `${preamble}\r\n${head}\r\n${body}${rows.length ? '\r\n' : ''}`;
}

export function matrixTemplateCsv(roleCodes: string[]): string {
  return serializeMatrixCsv(roleCodes, []);
}

export interface ParsedMatrix {
  rows: IacMatrixRow[];
  errors: IacMatrixRowError[];
  unknownRoleColumns: string[];
}

/** Parse a matrix CSV. validRoleCodes drives which columns become role grants. */
export function parseMatrixCsv(text: string, validRoleCodes: string[]): ParsedMatrix {
  const valid = new Set(validRoleCodes);
  const { headers, rows } = parseCsv(text);
  const errors: IacMatrixRowError[] = [];
  const unknownRoleColumns: string[] = [];

  if (headers.length === 0) {
    return { rows: [], errors: [{ lineNo: 0, email: '', reason: 'CSV has no header row' }], unknownRoleColumns };
  }
  const hasEmail = headers.includes('email');
  const hasCode = headers.includes('employee_code');
  if (!hasEmail && !hasCode) {
    return {
      rows: [],
      errors: [{ lineNo: 1, email: '', reason: 'CSV must have an "email" or "employee_code" column' }],
      unknownRoleColumns,
    };
  }

  // Identify role columns: any header not in identity set. Unknown codes become errors.
  const identitySet = new Set<string>(MATRIX_IDENTITY_COLS);
  const roleCols: string[] = [];
  for (const h of headers) {
    if (identitySet.has(h)) continue;
    if (valid.has(h)) roleCols.push(h);
    else unknownRoleColumns.push(h);
  }

  const out: IacMatrixRow[] = [];
  rows.forEach((raw, i) => {
    const lineNo = i + 2;
    const email = (raw.email ?? '').trim().toLowerCase();
    const code = (raw.employee_code ?? '').trim();
    if (!email && !code) {
      errors.push({ lineNo, email: '', reason: 'Both email and employee_code are blank' });
      return;
    }
    const rolesObj: Record<string, 'Y' | ''> = {};
    let badCell: string | null = null;
    for (const rc of roleCols) {
      const cell = raw[rc] ?? '';
      if (!isMatrixCellRecognised(cell)) {
        badCell = `${rc}="${cell}"`;
        break;
      }
      rolesObj[rc] = isMatrixCellTruthy(cell) ? 'Y' : '';
    }
    if (badCell) {
      errors.push({ lineNo, email: email || code, reason: `Unrecognised cell value (${badCell}). Use Y or blank.` });
      return;
    }
    out.push({
      employee_code: code || null,
      email,
      full_name: (raw.full_name ?? '').trim() || null,
      is_active: isMatrixCellTruthy(raw.is_active ?? ''),
      roles: rolesObj,
    });
  });

  return { rows: out, errors, unknownRoleColumns };
}

/**
 * Compute diff between desired matrix and current state.
 *
 * @param parsed         Matrix rows produced by parseMatrixCsv.
 * @param userByEmail    Map<lowercase_email, {id, full_name, is_active}>.
 * @param userByCode     Map<employee_code, {id, full_name, is_active, email}>.
 * @param roleByCode     Map<role_code, role_id>.
 * @param currentGlobal  Existing global assignments: Map<user_id, Map<role_code, assignment_id>>.
 * @param allowInactive  If false, inactive users are flagged as errors.
 */
export function diffMatrix(
  parsed: ParsedMatrix,
  userByEmail: Map<string, { id: string; full_name: string | null; is_active: boolean }>,
  userByCode: Map<string, { id: string; full_name: string | null; is_active: boolean; email: string }>,
  roleByCode: Map<string, string>,
  currentGlobal: Map<string, Map<string, string>>,
  allowInactive: boolean,
): IacMatrixDiff {
  const out: IacMatrixDiff = {
    toGrant: [],
    toRevoke: [],
    unchanged: 0,
    errors: [...parsed.errors],
    unknownRoleColumns: parsed.unknownRoleColumns,
  };

  parsed.rows.forEach((row, idx) => {
    const lineNo = idx + 2;
    const u = (row.email && userByEmail.get(row.email)) ||
              (row.employee_code && userByCode.get(row.employee_code)) ||
              null;
    if (!u) {
      out.errors.push({ lineNo, email: row.email || row.employee_code || '', reason: 'No user matches this email/employee_code' });
      return;
    }
    if (!u.is_active && !allowInactive) {
      out.errors.push({ lineNo, email: row.email || row.employee_code || '', reason: 'User is inactive (toggle override to include)' });
      return;
    }
    const current = currentGlobal.get(u.id) ?? new Map<string, string>();
    for (const [roleCode, cell] of Object.entries(row.roles)) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) continue; // Already reported as unknownRoleColumn.
      const currentlyHas = current.has(roleCode);
      const wantIt = cell === 'Y';
      if (wantIt && !currentlyHas) {
        out.toGrant.push({ user_id: u.id, email: row.email, full_name: u.full_name, role_id: roleId, role_code: roleCode });
      } else if (!wantIt && currentlyHas) {
        out.toRevoke.push({
          user_id: u.id, email: row.email, full_name: u.full_name,
          role_id: roleId, role_code: roleCode,
          assignment_id: current.get(roleCode)!,
        });
      } else {
        out.unchanged++;
      }
    }
  });

  return out;
}
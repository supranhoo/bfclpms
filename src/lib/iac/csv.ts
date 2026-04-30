/**
 * Minimal RFC-4180-ish CSV utilities for the IAC Bulk tab.
 * Zero external deps so the bundle stays lean.
 */
import type { IacBulkAssignmentRow, IacScopeType, ParsedBulkRow, BulkRowIssue } from '@/services/iac/types';

const VALID_SCOPES: IacScopeType[] = ['global', 'company', 'business_unit', 'department'];

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function serializeCsv<T extends Record<string, unknown>>(rows: T[], headers: (keyof T)[]): string {
  const head = headers.map((h) => escapeCell(String(h))).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h])).join(',')).join('\r\n');
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
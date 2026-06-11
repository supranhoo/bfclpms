import { z } from 'zod';
import { ALL_SAFETY_ROLES, type SafetyAppRole } from '@/lib/safetyRoles';

export const SAFETY_ROLE_CSV_HEADERS = [
  'employee_code',
  'email',
  'role',
] as const;

export const MAX_ROLE_IMPORT_ROWS = 500;

export const SafetyRoleImportRowSchema = z.object({
  employee_code: z.string().trim().max(50).optional().or(z.literal('')),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  role: z.string().trim().transform((v) => v.toLowerCase()).refine(
    (v): v is SafetyAppRole => (ALL_SAFETY_ROLES as readonly string[]).includes(v),
    { message: `role must be one of: ${ALL_SAFETY_ROLES.join(', ')}` },
  ),
}).refine((r) => (r.employee_code && r.employee_code.length > 0) || (r.email && r.email.length > 0), {
  message: 'employee_code or email is required',
  path: ['employee_code'],
});

export type SafetyRoleImportRow = z.infer<typeof SafetyRoleImportRowSchema>;

export interface ParsedRoleImport {
  rows: SafetyRoleImportRow[];
  errors: { line: number; message: string }[];
}

/** Minimal RFC-4180-ish CSV parser — handles quoted fields with commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export function parseRoleImportCsv(text: string): ParsedRoleImport {
  const matrix = parseCsv(text.trim());
  if (matrix.length === 0) {
    return { rows: [], errors: [{ line: 0, message: 'File is empty' }] };
  }
  const header = matrix[0].map((h) => h.trim().toLowerCase());
  const idx = {
    employee_code: header.indexOf('employee_code'),
    email: header.indexOf('email'),
    role: header.indexOf('role'),
  };
  if (idx.role === -1) {
    return { rows: [], errors: [{ line: 1, message: 'Header must include "role"' }] };
  }
  if (idx.employee_code === -1 && idx.email === -1) {
    return { rows: [], errors: [{ line: 1, message: 'Header must include "employee_code" or "email"' }] };
  }
  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_ROLE_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [{ line: 0, message: `Too many rows (${dataRows.length}); limit is ${MAX_ROLE_IMPORT_ROWS}.` }],
    };
  }
  const rows: SafetyRoleImportRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  dataRows.forEach((cols, i) => {
    const line = i + 2;
    const raw = {
      employee_code: idx.employee_code >= 0 ? (cols[idx.employee_code] ?? '').trim() : '',
      email: idx.email >= 0 ? (cols[idx.email] ?? '').trim() : '',
      role: (cols[idx.role] ?? '').trim(),
    };
    const parsed = SafetyRoleImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      parsed.error.errors.forEach((e) =>
        errors.push({ line, message: `${e.path.join('.') || 'row'}: ${e.message}` }),
      );
      return;
    }
    const dedupKey = `${(parsed.data.employee_code || parsed.data.email || '').toLowerCase()}::${parsed.data.role}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    rows.push(parsed.data);
  });
  return { rows, errors };
}

export function buildRoleExportCsv(
  rows: { employee_code: string | null; email: string | null; role: SafetyAppRole; assigned_at: string }[],
): string {
  const header = ['employee_code', 'email', 'role', 'assigned_at'];
  const escape = (v: string | null) => {
    const s = v ?? '';
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) =>
    [escape(r.employee_code), escape(r.email), r.role, r.assigned_at].join(','),
  );
  return [header.join(','), ...body].join('\n');
}
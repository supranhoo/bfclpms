/**
 * ADR-274 — Pure helpers for the BU Console group definition edit.
 *
 * The dialog never sends the whole form: it sends *only* the fields the admin
 * actually changed, so an untouched field can never overwrite a per-employee
 * value. Weightage impact is computed from the server dry-run so the admin
 * sees who leaves 100% before anything is written.
 */

export type ChangeSet = Record<string, string | null>;

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  const t = String(v).trim();
  return t.length > 0 ? t : null;
};

/**
 * Fields present in `next` whose value differs from `original`.
 * Only keys listed in `allowed` are ever emitted.
 */
export function diffChanges(
  original: Record<string, unknown>,
  next: Record<string, unknown>,
  allowed: readonly string[],
): ChangeSet {
  const out: ChangeSet = {};
  for (const key of Object.keys(next)) {
    if (!allowed.includes(key)) continue;
    const a = norm(original?.[key]);
    const b = norm(next[key]);
    if (a !== b) out[key] = b;
  }
  return out;
}

export const hasChanges = (c: ChangeSet): boolean => Object.keys(c).length > 0;

export interface WeightageImpactRow {
  employee_id?: string;
  employee_name?: string | null;
  employee_code?: string | null;
  current_total?: number | null;
  new_total?: number | null;
}

/** Employees whose weightage total would no longer be 100 after the edit. */
export function weightageDeviations(
  rows: WeightageImpactRow[] | null | undefined,
  expectedTotal = 100,
): WeightageImpactRow[] {
  return (rows ?? []).filter((r) => {
    const t = Number(r.new_total ?? 0);
    return Math.abs(t - expectedTotal) > 0.01;
  });
}

/** Deduplicated employee list — the dry-run emits one entry per affected row. */
export function uniqueByEmployee(rows: WeightageImpactRow[] | null | undefined): WeightageImpactRow[] {
  const seen = new Map<string, WeightageImpactRow>();
  for (const r of rows ?? []) {
    const key = r.employee_id ?? r.employee_code ?? r.employee_name ?? Math.random().toString();
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

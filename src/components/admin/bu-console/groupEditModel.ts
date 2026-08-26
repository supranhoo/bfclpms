/**
 * ADR-274 — Pure helpers for the BU Console group definition edit.
 *
 * The dialog never sends the whole form: it sends *only* the fields the admin
 * actually changed, so an untouched field can never overwrite a per-employee
 * value. Weightage impact is computed from the server dry-run so the admin
 * sees who leaves 100% before anything is written.
 */

export type ChangeSet = Record<string, string | null>;

/** Frequencies whose cycle spans more than one month (POLICY §54 v3). */
export const MULTI_MONTH_FREQS = ['Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'] as const;

export const isMultiMonthFrequency = (freq?: string | null): boolean =>
  !!freq && (MULTI_MONTH_FREQS as readonly string[]).includes(freq.trim());

/**
 * ADR-275 — a frequency change is only valid together with its cycle anchor:
 * without it the engine cannot tell Jan-Feb from Feb-Mar, and the percolation
 * trigger would back-fill the wrong months. Mirrors
 * `public.bu_console_validate_changes`.
 */
export function validateCycleChange(changes: ChangeSet): string | null {
  const freq = changes.frequency;
  if (freq == null) return null;
  const anchorGiven = Object.prototype.hasOwnProperty.call(changes, 'frequency_cycle_start');
  const anchor = changes.frequency_cycle_start ?? null;

  if (isMultiMonthFrequency(freq)) {
    if (!anchorGiven || !anchor) {
      return `A ${freq} KPI needs a cycle anchor (e.g. Jan-Feb) — pick the cycle before previewing.`;
    }
    return null;
  }
  if (anchor) return `A ${freq} KPI cannot carry a multi-month cycle anchor.`;
  return null;
}

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

/**
 * ADR-326 — scope is inert for a KPI that is not organisation-level and was not
 * organisation-level before the edit. The change set must not carry a scope or
 * scope-target clear in that case: it is a change nobody typed, and it would
 * drag a wording correction onto the protected path.
 */
export function isScopeInert(
  orgLevel: boolean | null,
  originalIsOrgLevel: boolean | null | undefined,
): boolean {
  return orgLevel === false && (originalIsOrgLevel ?? false) === false;
}

/** Rating ladder + unit values a value-based KPI owns. */
export interface LadderValues {
  r5: string; r4: string; r3: string; r2: string; r1: string; r0: string; uom: string;
}

const BLANK_LADDER: LadderValues = { r5: '', r4: '', r3: '', r2: '', r1: '', r0: '', uom: '' };

/**
 * ADR-328 — a Yes/No or tiered KPI is scored from its options: the numeric R0–R5
 * ladder and the unit of measure carry no meaning there, so they are blanked
 * instead of travelling in the change set with stale values.
 */
export function ladderForType(uomType: string | null | undefined, values: LadderValues): LadderValues {
  return uomType === 'numeric' ? values : { ...BLANK_LADDER };
}

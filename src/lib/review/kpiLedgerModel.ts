/**
 * ADR-309 — KPI Data Ledger: pure model layer.
 *
 * Every KPI can carry its own data table whose *shape* is configuration, not
 * code (POLICY §KPI-LEDGER-CONFIGURABLE-SHAPE). This module holds only pure
 * helpers — column typing, derived-column evaluation, roll-up mirroring and
 * display formatting. Authorisation, persistence and the authoritative roll-up
 * all live server-side in the ADR-309 RPCs; the mirror here exists so the grid
 * can show the working before a save round-trip.
 */

export type LedgerDataType =
  | 'number' | 'percent' | 'currency' | 'text' | 'date'
  | 'select' | 'org_ref' | 'employee_ref' | 'formula';

export type LedgerGranularity = 'monthly' | 'quarterly' | 'weekly' | 'event';

export type LedgerRollupRule =
  | 'sum_ratio' | 'sum' | 'avg' | 'weighted' | 'last' | 'max' | 'min' | 'none';

export type LedgerEditableBy = 'provider' | 'approver' | 'admin' | 'system';

export interface LedgerColumn {
  id?: string;
  dataset_id?: string;
  column_key: string;
  label: string;
  data_type: LedgerDataType;
  unit?: string | null;
  is_required: boolean;
  is_key: boolean;
  editable_by: LedgerEditableBy;
  /** Expression over other column keys, e.g. `achieved / target * 100`. */
  formula?: string | null;
  display_format?: string | null;
  options?: unknown[];
  sort_order: number;
}

export interface LedgerDef {
  id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  title: string;
  description?: string | null;
  granularity: LedgerGranularity;
  rollup_rule: LedgerRollupRule;
  value_column_key?: string | null;
  target_column_key?: string | null;
  weight_column_key?: string | null;
  allow_provider_override: boolean;
  is_active: boolean;
}

export interface LedgerRow {
  id: string;
  dataset_id: string;
  review_period: string;
  review_year: number;
  period_start?: string | null;
  division_id?: string | null;
  business_unit_id?: string | null;
  department_id?: string | null;
  location_id?: string | null;
  pms_grade_id?: string | null;
  level_id?: string | null;
  employee_id?: string | null;
  scope_label?: string | null;
  impact_scope: Record<string, unknown>;
  values: Record<string, unknown>;
  revision: number;
  entered_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LedgerBundle {
  def: LedgerDef;
  columns: LedgerColumn[];
}

export interface LedgerValidation {
  id: string;
  dataset_id: string;
  review_period: string;
  review_year: number;
  verdict: 'validated' | 'rejected';
  note?: string | null;
  row_count: number;
  validated_by?: string | null;
  validated_at: string;
  invalidated_at?: string | null;
  invalidated_reason?: string | null;
}

export const ROLLUP_LABELS: Record<LedgerRollupRule, string> = {
  sum_ratio: 'Sum achieved ÷ sum target (%)',
  sum: 'Sum of the value column',
  avg: 'Average of the value column',
  weighted: 'Weighted average',
  last: 'Latest period entered',
  max: 'Highest value',
  min: 'Lowest value',
  none: 'No roll-up (headline entered manually)',
};

export const GRANULARITY_LABELS: Record<LedgerGranularity, string> = {
  monthly: 'One row per month',
  quarterly: 'One row per quarter',
  weekly: 'One row per week',
  event: 'One row per event',
};

export const DATA_TYPE_LABELS: Record<LedgerDataType, string> = {
  number: 'Number',
  percent: 'Percentage',
  currency: 'Currency',
  text: 'Text',
  date: 'Date',
  select: 'Choice list',
  org_ref: 'Organisation unit',
  employee_ref: 'Employee',
  formula: 'Derived (formula)',
};

/** Numeric column types the roll-up can consume. */
export const NUMERIC_TYPES: LedgerDataType[] = ['number', 'percent', 'currency', 'formula'];

export function isNumericColumn(col: LedgerColumn): boolean {
  return NUMERIC_TYPES.includes(col.data_type);
}

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Evaluate a derived column. Deliberately restricted to the four arithmetic
 * operators, parentheses, numbers and column keys — no host access, so a
 * formula stored as master data can never become code execution.
 */
export function evaluateFormula(
  formula: string,
  values: Record<string, unknown>,
): number | null {
  if (!formula || !formula.trim()) return null;
  const substituted = formula.replace(/[a-z_][a-z0-9_]*/gi, (key) => {
    const n = toNumber(values[key]);
    return n === null ? 'NaN' : String(n);
  });
  if (!/^[0-9+\-*/(). NaN]+$/.test(substituted)) return null;
  if (substituted.includes('NaN')) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict";return (${substituted});`)() as unknown;
    const n = toNumber(result);
    return n === null || !Number.isFinite(n) ? null : Number(n.toFixed(4));
  } catch {
    return null;
  }
}

/** Values with every derived column recomputed from its formula. */
export function withDerivedValues(
  columns: LedgerColumn[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...values };
  for (const col of columns) {
    if (col.data_type !== 'formula' || !col.formula) continue;
    next[col.column_key] = evaluateFormula(col.formula, next);
  }
  return next;
}

export interface RollupResult {
  value: number | null;
  rowCount: number;
  rule: LedgerRollupRule;
  working: string;
}

/**
 * Client mirror of `org_kpi_dataset_rollup`. The server value always wins; this
 * exists so the provider sees the number move as they type.
 */
export function computeRollup(
  def: Pick<LedgerDef, 'rollup_rule' | 'value_column_key' | 'target_column_key' | 'weight_column_key'>,
  rows: Array<Pick<LedgerRow, 'values' | 'period_start' | 'review_period'>>,
): RollupResult {
  const rule = def.rollup_rule;
  const vKey = def.value_column_key ?? '';
  const tKey = def.target_column_key ?? '';
  const wKey = def.weight_column_key ?? '';
  const vals = rows.map((r) => toNumber(r.values?.[vKey])).filter((n): n is number => n !== null);
  const rowCount = rows.length;

  if (rowCount === 0) {
    return { value: null, rowCount: 0, rule, working: 'No rows captured for this period' };
  }

  const sumValue = vals.reduce((a, b) => a + b, 0);
  const sumTarget = rows
    .map((r) => toNumber(r.values?.[tKey]))
    .filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);

  const round2 = (n: number) => Number(n.toFixed(2));

  switch (rule) {
    case 'sum':
      return { value: round2(sumValue), rowCount, rule, working: `Sum of ${vals.length} value(s)` };
    case 'avg':
      return {
        value: vals.length ? round2(sumValue / vals.length) : null,
        rowCount, rule, working: `Average of ${vals.length} value(s)`,
      };
    case 'sum_ratio':
      return {
        value: sumTarget === 0 ? null : round2((100 * sumValue) / sumTarget),
        rowCount, rule,
        working: sumTarget === 0
          ? 'Target total is zero — ratio cannot be computed'
          : `${round2(sumValue)} ÷ ${round2(sumTarget)} × 100`,
      };
    case 'weighted': {
      let num = 0;
      let den = 0;
      for (const r of rows) {
        const v = toNumber(r.values?.[vKey]);
        const w = toNumber(r.values?.[wKey]);
        if (v === null || w === null) continue;
        num += v * w;
        den += w;
      }
      return {
        value: den === 0 ? null : Number((num / den).toFixed(4)),
        rowCount, rule,
        working: den === 0 ? 'Total weight is zero' : `Weighted over ${rowCount} row(s)`,
      };
    }
    case 'last': {
      const sorted = [...rows].sort((a, b) =>
        String(a.period_start ?? a.review_period).localeCompare(String(b.period_start ?? b.review_period)),
      );
      const last = toNumber(sorted[sorted.length - 1]?.values?.[vKey]);
      return { value: last, rowCount, rule, working: 'Latest period entered' };
    }
    case 'max':
      return { value: vals.length ? Math.max(...vals) : null, rowCount, rule, working: 'Highest value' };
    case 'min':
      return { value: vals.length ? Math.min(...vals) : null, rowCount, rule, working: 'Lowest value' };
    default:
      return { value: null, rowCount, rule, working: 'No roll-up configured' };
  }
}

export type ExceptionCode =
  | 'missing_required' | 'zero_target' | 'no_value' | 'out_of_range' | 'duplicate_scope';

export interface LedgerException {
  rowId: string;
  code: ExceptionCode;
  message: string;
}

/** Audit-facing exception flags for one period's rows. */
export function detectExceptions(
  def: Pick<LedgerDef, 'value_column_key' | 'target_column_key'>,
  columns: LedgerColumn[],
  rows: LedgerRow[],
): LedgerException[] {
  const out: LedgerException[] = [];
  const seen = new Map<string, string>();

  for (const row of rows) {
    const scopeKey = [
      row.review_year, row.review_period, row.division_id ?? '', row.business_unit_id ?? '',
      row.department_id ?? '', row.employee_id ?? '',
    ].join('|');
    if (seen.has(scopeKey)) {
      out.push({ rowId: row.id, code: 'duplicate_scope', message: 'Another row already covers this period and scope' });
    } else {
      seen.set(scopeKey, row.id);
    }

    for (const col of columns) {
      if (!col.is_required || col.data_type === 'formula') continue;
      const raw = row.values?.[col.column_key];
      if (raw === null || raw === undefined || raw === '') {
        out.push({ rowId: row.id, code: 'missing_required', message: `${col.label} is required` });
      }
    }

    if (def.target_column_key) {
      const t = toNumber(row.values?.[def.target_column_key]);
      if (t !== null && t === 0) {
        out.push({ rowId: row.id, code: 'zero_target', message: 'Target is zero' });
      }
    }
    if (def.value_column_key) {
      const v = toNumber(row.values?.[def.value_column_key]);
      if (v === null) {
        out.push({ rowId: row.id, code: 'no_value', message: 'No achieved value captured' });
      } else if (def.target_column_key) {
        const t = toNumber(row.values?.[def.target_column_key]);
        if (t && t > 0 && v / t > 5) {
          out.push({ rowId: row.id, code: 'out_of_range', message: 'Achieved is more than 5× the target' });
        }
      }
    }
  }
  return out;
}

/** Display a single cell according to its column definition. */
export function formatCell(col: LedgerColumn, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (isNumericColumn(col)) {
    const n = toNumber(raw);
    if (n === null) return String(raw);
    const fixed = n.toFixed(col.data_type === 'currency' ? 2 : 2);
    const withSep = Number(fixed).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    if (col.data_type === 'percent') return `${withSep}%`;
    if (col.data_type === 'currency') return `₹${withSep}`;
    return col.unit ? `${withSep} ${col.unit}` : withSep;
  }
  return String(raw);
}

/** Human label for a row's scope, falling back to the stored label. */
export function scopeLabelOf(
  row: Pick<LedgerRow, 'scope_label' | 'employee_id' | 'department_id' | 'business_unit_id' | 'division_id'>,
  names: { departments?: Record<string, string>; businessUnits?: Record<string, string>; divisions?: Record<string, string> } = {},
): string {
  if (row.scope_label) return row.scope_label;
  if (row.department_id) return names.departments?.[row.department_id] ?? 'Department';
  if (row.business_unit_id) return names.businessUnits?.[row.business_unit_id] ?? 'Business unit';
  if (row.division_id) return names.divisions?.[row.division_id] ?? 'Division';
  if (row.employee_id) return 'Employee';
  return 'Whole organisation';
}

/** A validation only counts while it has not been invalidated by later edits. */
export function isValidationLive(v: LedgerValidation | null | undefined): boolean {
  return !!v && v.verdict === 'validated' && !v.invalidated_at;
}

/** Starter column set offered when an admin designs a new monthly data table. */
export function defaultMonthlyColumns(): LedgerColumn[] {
  return [
    { column_key: 'target', label: 'Target', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 10 },
    { column_key: 'achieved', label: 'Achieved', data_type: 'number', is_required: true, is_key: false, editable_by: 'provider', sort_order: 20 },
    { column_key: 'achievement_pct', label: 'Achievement %', data_type: 'formula', formula: 'achieved / target * 100', is_required: false, is_key: false, editable_by: 'system', sort_order: 30 },
    { column_key: 'remarks', label: 'Remarks', data_type: 'text', is_required: false, is_key: false, editable_by: 'provider', sort_order: 40 },
  ];
}

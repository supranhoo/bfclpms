/**
 * ADR-317 — Exception KPIs (scoped seeding & release): pure model layer.
 *
 * Some KPIs are not entered per employee at all — a safety metric such as LTI
 * or STI is recorded once per department. Departments with no incident carry
 * the *clean value* (normally 0) and score full marks; departments where the
 * officer records an incident penalise every employee mapped to them
 * (POLICY §KPI-EXCEPTION-SCOPED-RELEASE).
 *
 * Nothing here is KPI-specific: the scope dimension, the clean value and the
 * direction are master data on the data table, never hardcoded
 * (Zero-Hardcoding Rule). Authorisation, scoring and propagation are entirely
 * server-side; this module only types and describes the shape.
 */

/** Which organisational level one row of an exception table stands for. */
export type ExceptionScopeDimension = 'department' | 'business_unit' | 'location';

/** How a data table is filled in. */
export type LedgerEntryMode = 'row_entry' | 'exception';

/** Which way the recorded number hurts. */
export type ExceptionDirection = 'lower_better' | 'higher_better';

export interface ExceptionConfig {
  entry_mode: LedgerEntryMode;
  scope_dimension: ExceptionScopeDimension | null;
  clean_value: number | null;
  exception_direction: ExceptionDirection;
}

export interface ExceptionFlaggedScope {
  row_id: string;
  department_id: string | null;
  scope_name: string;
  value: number;
  employees: number;
}

export interface ExceptionSummary {
  entry_mode: LedgerEntryMode;
  scope_dimension: ExceptionScopeDimension;
  clean_value: number;
  direction: ExceptionDirection;
  total_scopes: number;
  flagged_scopes: number;
  clean_scopes: number;
  blank_scopes: number;
  employees_flagged: number;
  flagged: ExceptionFlaggedScope[];
}

export interface ExceptionSeedResult {
  dry_run: boolean;
  created: number;
  existing: number;
  clean_value: number;
  value_column_key: string;
}

export interface ExceptionReleasePreviewRow {
  employee_name: string | null;
  employee_code: string | null;
  department_name: string;
  value: number;
  score: number | null;
}

export interface ExceptionReleaseResult {
  ok: boolean;
  reason?: string;
  dry_run: boolean;
  run_id?: string;
  employees_targeted: number;
  employees_flagged: number;
  employees_clean: number;
  capped: boolean;
  clean_value?: number;
  sample?: ExceptionReleasePreviewRow[];
  result?: Record<string, unknown>;
}

export interface ExceptionReleaseRun {
  id: string;
  status: 'running' | 'completed' | 'failed';
  review_period: string;
  review_year: number;
  flagged_scopes: number;
  clean_scopes: number;
  employees_targeted: number;
  employees_updated: number;
  employees_skipped: number;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export const SCOPE_DIMENSION_LABELS: Record<ExceptionScopeDimension, string> = {
  department: 'One row per department',
  business_unit: 'One row per business unit',
  location: 'One row per location',
};

export const EXCEPTION_DIRECTION_LABELS: Record<ExceptionDirection, string> = {
  lower_better: 'Anything above the clean value is an incident',
  higher_better: 'Anything below the clean value is an incident',
};

/** Is this recorded number an exception against the table's clean baseline? */
export function isFlaggedValue(
  value: number | null | undefined,
  cleanValue: number,
  direction: ExceptionDirection,
): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  return direction === 'lower_better' ? value > cleanValue : value < cleanValue;
}

/** Exception tables are only usable once the officer knows what "clean" means. */
export function isExceptionReady(config: ExceptionConfig | null | undefined): boolean {
  return !!config
    && config.entry_mode === 'exception'
    && config.scope_dimension !== null
    && config.clean_value !== null;
}

/** Plain-English readiness line for the release action. */
export function describeReleaseReadiness(summary: ExceptionSummary | null | undefined): string {
  if (!summary) return 'Loading the department roster…';
  if (summary.total_scopes === 0) {
    return 'No departments seeded yet — fill the roster first.';
  }
  if (summary.blank_scopes > 0) {
    return `${summary.blank_scopes} department(s) still blank; they will be treated as clean unless you fill them.`;
  }
  return `${summary.flagged_scopes} flagged, ${summary.clean_scopes} clean — ready to release.`;
}

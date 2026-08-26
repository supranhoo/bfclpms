/**
 * ADR-319 — one scope vocabulary for KPIs (POLICY §KPI-SCOPE-SINGLE-VOCABULARY).
 * ADR-320 — the grouped scopes are turned on, and a grouped scope owns exactly
 * one target id (which business unit, which location, …). Flight 1 ships
 * Business Unit and Location; Division, PMS Grade and Level stay listed as
 * planned until flight 2, so both surfaces read identically.
 *
 * Every surface that offers a scope imports from here — the console create
 * dialog, the scope-change menu and the target picker — so a scope is added in
 * exactly one place (Zero-Hardcoding Rule).
 *
 * Mapping to the `kpis` / `org_kpi_values` columns:
 *   individual    → is_org_level = false, org_level_scope = NULL, no target
 *   organization  → is_org_level = true,  org_level_scope = 'organization', no target
 *   department    → … 'department',    target column department_id
 *   employee      → … 'employee',      target column employee_id
 *   business_unit → … 'business_unit', target column business_unit_id
 *   location      → … 'location',      target column location_id
 *   division      → … 'division',      target column division_id
 *   pms_grade     → … 'pms_grade',     target column pms_grade_id
 *   level         → … 'level',         target column level_id
 * The same mapping lives server-side in `public.kpi_scope_target_column()`.
 */

/** Scopes the system can issue and score today. */
export const KPI_SCOPES = [
  'individual', 'organization', 'department', 'employee', 'business_unit', 'location',
] as const;
export type KpiScope = (typeof KPI_SCOPES)[number];

/** Scopes the org model recognises but the cascade does not ship yet (flight 2). */
export const PLANNED_KPI_SCOPES = ['division', 'pms_grade', 'level'] as const;
export type PlannedKpiScope = (typeof PLANNED_KPI_SCOPES)[number];

/** Every scope word the database accepts, live or planned. */
export const ALL_KPI_SCOPES = [...KPI_SCOPES, ...PLANNED_KPI_SCOPES] as const;
export type AnyKpiScope = (typeof ALL_KPI_SCOPES)[number];

export interface KpiScopeCopy {
  /** Short noun used in menus. */
  label: string;
  /** Plain-English sentence used on the create cards. */
  hint: string;
  /** Column the scope's target id is written to; null when it needs no target. */
  targetColumn: string | null;
  /** Wording for the "which one?" question the picker asks. */
  targetPrompt?: string;
}

export const KPI_SCOPE_COPY: Record<KpiScope, KpiScopeCopy> = {
  individual: {
    label: 'Individual',
    hint: 'Each person is measured on their own number.',
    targetColumn: null,
  },
  organization: {
    label: 'Organization',
    hint: 'One shared value — e.g. production target vs actual — reaches everyone in scope.',
    targetColumn: null,
  },
  department: {
    label: 'Department',
    hint: 'One event per department — e.g. an LTI — applies to everyone in that department.',
    targetColumn: 'department_id',
    targetPrompt: 'Which department?',
  },
  employee: {
    label: 'Employee',
    hint: 'A central figure entered per employee and released to their scorecard.',
    targetColumn: 'employee_id',
    targetPrompt: 'Which employee?',
  },
  business_unit: {
    label: 'Business Unit',
    hint: 'One value per business unit, reaching everyone in its departments.',
    targetColumn: 'business_unit_id',
    targetPrompt: 'Which business unit?',
  },
  location: {
    label: 'Location',
    hint: 'One value per plant or site, reaching everyone posted there.',
    targetColumn: 'location_id',
    targetPrompt: 'Which location?',
  },
};

export const PLANNED_KPI_SCOPE_LABELS: Record<PlannedKpiScope, string> = {
  division: 'Division',
  pms_grade: 'PMS Grade',
  level: 'Level',
};

/** Target column for any scope word, planned scopes included. */
export const KPI_SCOPE_TARGET_COLUMNS: Record<AnyKpiScope, string | null> = {
  individual: null,
  organization: null,
  department: 'department_id',
  employee: 'employee_id',
  business_unit: 'business_unit_id',
  location: 'location_id',
  division: 'division_id',
  pms_grade: 'pms_grade_id',
  level: 'level_id',
};

/**
 * Legacy console words (ADR-297) kept as read-only aliases so anything still
 * carrying a `kind` resolves to the same scope.
 */
const LEGACY_KIND_ALIASES: Record<string, KpiScope> = {
  individual: 'individual',
  shared: 'organization',
  department_event: 'department',
};

/** Normalises a scope or a legacy `kind` to a scope; unknown input is individual. */
export function toKpiScope(value: string | null | undefined): KpiScope {
  if (!value) return 'individual';
  if ((KPI_SCOPES as readonly string[]).includes(value)) return value as KpiScope;
  return LEGACY_KIND_ALIASES[value] ?? 'individual';
}

/** True when the scope must name a target before it can be saved (ADR-320). */
export function scopeNeedsTarget(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return (KPI_SCOPE_TARGET_COLUMNS as Record<string, string | null>)[scope] != null;
}

export interface KpiScopeColumns {
  is_org_level: boolean;
  org_level_scope: KpiScope | null;
}

/** The only place the scope is turned into database columns. */
export function toKpiColumns(scope: KpiScope): KpiScopeColumns {
  return scope === 'individual'
    ? { is_org_level: false, org_level_scope: null }
    : { is_org_level: true, org_level_scope: scope };
}

/** Reads the scope back off a KPI row (individual when it is not org-level). */
export function fromKpiColumns(row: {
  is_org_level?: boolean | null;
  org_level_scope?: string | null;
}): KpiScope {
  if (!row.is_org_level) return 'individual';
  return toKpiScope(row.org_level_scope);
}

/** Menu/card label for any scope value, legacy and planned words included. */
export function kpiScopeLabel(value: string | null | undefined): string {
  if (value && (PLANNED_KPI_SCOPES as readonly string[]).includes(value)) {
    return PLANNED_KPI_SCOPE_LABELS[value as PlannedKpiScope];
  }
  return KPI_SCOPE_COPY[toKpiScope(value)].label;
}

/**
 * ADR-322 — on a `kpis` row only the grouped org dimensions carry a target
 * column; `department` and `employee` resolve from the row's own employee, so
 * their columns must never be rewritten by a group edit. Mirrors
 * `public.bu_console_scope_target_column()` and the `kpis_scope_target_check`
 * constraint.
 */
export const KPI_ROW_SCOPE_TARGET_COLUMNS: Record<AnyKpiScope, string | null> = {
  individual: null,
  organization: null,
  department: null,
  employee: null,
  business_unit: 'business_unit_id',
  location: 'location_id',
  division: 'division_id',
  pms_grade: 'pms_grade_id',
  level: 'level_id',
};

/** Every target column a KPI row can carry for a grouped scope. */
export const KPI_ROW_TARGET_COLUMNS = [
  'business_unit_id', 'location_id', 'division_id', 'pms_grade_id', 'level_id',
] as const;

/** True when editing a KPI row in this scope must also name a target id. */
export function rowScopeNeedsTarget(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return (KPI_ROW_SCOPE_TARGET_COLUMNS as Record<string, string | null>)[scope] != null;
}

/**
 * ADR-319 — one scope vocabulary for KPIs (POLICY §KPI-SCOPE-SINGLE-VOCABULARY).
 *
 * The console used to speak a second language ("Individual / Shared value /
 * Department event") for a concept the rest of the product already names as a
 * scope (Organization / Department / Employee). Both wrote the same two
 * columns, so the words are collapsed here and imported by every surface that
 * offers a scope — the create dialog and the scope-change menu — so a new
 * scope is added in exactly one place (Zero-Hardcoding Rule).
 *
 * Mapping to the `kpis` columns:
 *   individual   → is_org_level = false, org_level_scope = NULL
 *   organization → is_org_level = true,  org_level_scope = 'organization'
 *   department   → is_org_level = true,  org_level_scope = 'department'
 *   employee     → is_org_level = true,  org_level_scope = 'employee'
 */

/** Scopes the system can issue and score today. */
export const KPI_SCOPES = ['individual', 'organization', 'department', 'employee'] as const;
export type KpiScope = (typeof KPI_SCOPES)[number];

/** Scopes the org model recognises but the cascade does not ship yet. */
export const PLANNED_KPI_SCOPES = [
  'division', 'business_unit', 'location', 'pms_grade', 'level',
] as const;
export type PlannedKpiScope = (typeof PLANNED_KPI_SCOPES)[number];

export interface KpiScopeCopy {
  /** Short noun used in menus. */
  label: string;
  /** Plain-English sentence used on the create cards. */
  hint: string;
}

export const KPI_SCOPE_COPY: Record<KpiScope, KpiScopeCopy> = {
  individual: {
    label: 'Individual',
    hint: 'Each person is measured on their own number.',
  },
  organization: {
    label: 'Organization',
    hint: 'One shared value — e.g. production target vs actual — reaches everyone in scope.',
  },
  department: {
    label: 'Department',
    hint: 'One event per department — e.g. an LTI — applies to everyone in that department.',
  },
  employee: {
    label: 'Employee',
    hint: 'A central figure entered per employee and released to their scorecard.',
  },
};

export const PLANNED_KPI_SCOPE_LABELS: Record<PlannedKpiScope, string> = {
  division: 'Division',
  business_unit: 'Business Unit',
  location: 'Location',
  pms_grade: 'PMS Grade',
  level: 'Level',
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

/** Menu/card label for any scope value, legacy words included. */
export function kpiScopeLabel(value: string | null | undefined): string {
  return KPI_SCOPE_COPY[toKpiScope(value)].label;
}

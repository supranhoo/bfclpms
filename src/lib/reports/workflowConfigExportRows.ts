/**
 * ADR-214 / POLICY §WF-CONFIG-EXPORT-SELF-SUFFICIENT
 *
 * Pure row builders for the Workflow Configuration Report export.
 *
 * These live outside the React component so the "every cell printed —"
 * regression (blank Employee Overrides sheet, 2026-07-31) is unit-testable
 * without a browser. No data access, no XLSX, no toasts.
 */

import {
  CHAIN_STAGES,
  CHAIN_STAGE_LABEL,
  NA_REASON_LABEL,
  resolveChain,
  type ResolverContext,
  type ResolverProfile,
} from '@/lib/workflowResolver';

export interface ExportTemplate {
  id: string;
  display_name: string;
  stages: string[];
  is_default?: boolean;
  is_active?: boolean;
}

export interface ExportConfig {
  config_type: string;
  config_value: string;
  workflow_template_id: string;
  review_period?: string | null;
  review_year?: number | null;
}

export type TemplateSource = 'employee' | 'department' | 'pms_grade' | 'default';

/**
 * Rendered when a `workflow_config.config_value` has no matching roster row.
 * Deliberately NOT an em dash: a blank-looking cell hides the failure, this
 * one names it and keeps the id so the row is traceable.
 */
export function unresolvedMarker(id: string): string {
  return `Unresolved (id: ${id.slice(0, 8)}…)`;
}

export const EM_DASH = '—';

function nameOf(p: ResolverProfile | undefined | null): string | null {
  if (!p) return null;
  return p.full_name || p.email || null;
}

export function formatStages(
  stages: string[],
  label: (s: string) => string,
): string {
  return stages.map(label).join(' → ');
}

export interface EmployeeOverrideRow {
  'Employee Name': string;
  'Employee Code': string;
  'Email': string;
  'Employee Status': string;
  'PMS Grade': string;
  'Department': string;
  'Reporting Manager': string;
  'Skip-Level Manager': string;
  'Assigned Template': string;
  'Stages': string;
  'Scope': string;
  'Review Period': string;
  'Review Year': string | number;
  'Month': string;
}

export interface BuildEmployeeOverrideArgs {
  configs: ExportConfig[];
  profilesById: Map<string, ResolverProfile>;
  templatesById: Map<string, ExportTemplate>;
  departmentsById: Map<string, string>;
  stageLabel: (s: string) => string;
  monthOf: (period: string | null | undefined) => string;
}

/** Sheet 2 — one row per employee-scoped workflow override. */
export function buildEmployeeOverrideRows({
  configs,
  profilesById,
  templatesById,
  departmentsById,
  stageLabel,
  monthOf,
}: BuildEmployeeOverrideArgs): EmployeeOverrideRow[] {
  return configs
    .filter((c) => c.config_type === 'employee')
    .map((c) => {
      const p = profilesById.get(c.config_value);
      const tmpl = templatesById.get(c.workflow_template_id);
      const manager = p?.reporting_manager_id
        ? profilesById.get(p.reporting_manager_id)
        : null;
      const skipManager = manager?.reporting_manager_id
        ? profilesById.get(manager.reporting_manager_id)
        : null;

      return {
        'Employee Name': nameOf(p) ?? unresolvedMarker(c.config_value),
        'Employee Code': p?.employee_code || (p ? EM_DASH : unresolvedMarker(c.config_value)),
        'Email': p?.email || EM_DASH,
        'Employee Status': p ? (p.is_active ? 'Active' : 'Inactive') : EM_DASH,
        'PMS Grade': p?.pms_grade || EM_DASH,
        'Department': p?.department_id ? departmentsById.get(p.department_id) || EM_DASH : EM_DASH,
        'Reporting Manager':
          nameOf(manager) ??
          (p?.reporting_manager_id ? unresolvedMarker(p.reporting_manager_id) : EM_DASH),
        'Skip-Level Manager':
          nameOf(skipManager) ??
          (manager?.reporting_manager_id
            ? unresolvedMarker(manager.reporting_manager_id)
            : EM_DASH),
        'Assigned Template': tmpl?.display_name || EM_DASH,
        'Stages': tmpl ? formatStages(tmpl.stages, stageLabel) : EM_DASH,
        'Scope': c.review_period ? 'Period-Specific' : 'Global',
        'Review Period': c.review_period || EM_DASH,
        'Review Year': c.review_year ?? EM_DASH,
        'Month': monthOf(c.review_period),
      };
    });
}

/** How many override rows could not be matched to a roster profile. */
export function unresolvedCount(
  configs: ExportConfig[],
  profilesById: Map<string, ResolverProfile>,
): number {
  return configs.filter(
    (c) => c.config_type === 'employee' && !profilesById.has(c.config_value),
  ).length;
}

/**
 * Global template resolution: employee override > department > pms_grade > default.
 * Period-specific configs are intentionally ignored — this export sits on a
 * screen with no period selector (the period-aware surface is
 * /reports/workflow-resolution).
 */
export function resolveGlobalTemplate(
  p: ResolverProfile,
  configs: ExportConfig[],
  templatesById: Map<string, ExportTemplate>,
  defaultTemplate: ExportTemplate | undefined,
): { template: ExportTemplate | undefined; source: TemplateSource } {
  const globals = configs.filter((c) => !c.review_period);
  const emp = globals.find((c) => c.config_type === 'employee' && c.config_value === p.id);
  if (emp) return { template: templatesById.get(emp.workflow_template_id), source: 'employee' };

  if (p.department_id) {
    const dept = globals.find(
      (c) => c.config_type === 'department' && c.config_value === p.department_id,
    );
    if (dept) return { template: templatesById.get(dept.workflow_template_id), source: 'department' };
  }
  if (p.pms_grade) {
    const grade = globals.find(
      (c) => c.config_type === 'pms_grade' && c.config_value === p.pms_grade,
    );
    if (grade) return { template: templatesById.get(grade.workflow_template_id), source: 'pms_grade' };
  }
  return { template: defaultTemplate, source: 'default' };
}

export interface BuildResolvedArgs {
  profiles: ResolverProfile[];
  configs: ExportConfig[];
  templatesById: Map<string, ExportTemplate>;
  departmentsById: Map<string, string>;
  defaultTemplate: ExportTemplate | undefined;
  ctx: ResolverContext;
}

/** Sheet 5 — resolved reviewer chain per employee (global templates only). */
export function buildResolvedEmployeeRows({
  profiles,
  configs,
  templatesById,
  departmentsById,
  defaultTemplate,
  ctx,
}: BuildResolvedArgs): Record<string, string>[] {
  return profiles.map((p) => {
    const { template, source } = resolveGlobalTemplate(p, configs, templatesById, defaultTemplate);
    const chain = resolveChain(
      p,
      {
        templateId: template?.id ?? null,
        templateName: template?.display_name ?? null,
        stages: template?.stages ?? [],
        source,
      },
      ctx,
    );

    const cell = (stage: (typeof CHAIN_STAGES)[number]): string => {
      const s = chain.stages[stage];
      if (!s.inTemplate) return 'N/A — Stage not in template';
      if (s.naReason) return `N/A — ${NA_REASON_LABEL[s.naReason]}`;
      return s.users.map((u) => u.full_name || u.email).join('; ');
    };

    return {
      'Employee Code': p.employee_code || EM_DASH,
      'Employee Name': p.full_name || p.email,
      'Employee Status': p.is_active ? 'Active' : 'Inactive',
      'Department': p.department_id ? departmentsById.get(p.department_id) || EM_DASH : EM_DASH,
      'PMS Grade': p.pms_grade || EM_DASH,
      'Resolved Template (Global)': template?.display_name || EM_DASH,
      'Source': source,
      ...Object.fromEntries(CHAIN_STAGES.map((s) => [CHAIN_STAGE_LABEL[s], cell(s)])),
      'Has N/A': chain.hasAnyNa ? 'Yes' : 'No',
    };
  });
}

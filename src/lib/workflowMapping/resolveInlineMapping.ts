/**
 * Pure resolver for the "Workflow mapping" card in Edit User → Access & Login.
 *
 * Given the full `workflow_config` list, the effective resolution returned by
 * `get_employee_workflow_info` (via `useEmployeeWorkflow`), and the selected
 * (period, year), classify the source so the UI can label WHY the shown
 * template is effective.
 *
 * See POLICY §AR-WF-MAPPING-VISIBILITY and mem://architecture/per-employee-workflow-resolution.
 */

export type MappingSource =
  | 'employee_exact'
  | 'employee_earlier_month'
  | 'department'
  | 'pms_grade'
  | 'default'
  | 'none';

export interface InlineConfigRow {
  config_type: 'employee' | 'department' | 'pms_grade';
  config_value: string;
  workflow_template_id: string;
  review_period: string | null;
  review_year: number | null;
}

export interface InlineResolvedInfo {
  template_id: string;
  display_name: string;
  stages: string[];
  config_source: 'employee' | 'department' | 'pms_grade' | 'default';
}

export interface ResolvedMapping {
  templateId: string | null;
  displayName: string | null;
  stages: string[];
  source: MappingSource;
  /** For `employee_earlier_month` — the month/year the carried row was set. */
  effectiveFrom: { period: string; year: number } | null;
}

const MONTH_INDEX: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function monthOrdinal(period: string, year: number): number {
  const m = MONTH_INDEX[period];
  return year * 12 + (typeof m === 'number' ? m : 0);
}

export function resolveInlineMapping(args: {
  configs: InlineConfigRow[] | null | undefined;
  resolved: InlineResolvedInfo | null | undefined;
  employeeId: string;
  period: string;
  year: number;
}): ResolvedMapping {
  const { configs, resolved, employeeId, period, year } = args;
  const rows = configs ?? [];
  const target = monthOrdinal(period, year);

  const empRows = rows.filter(
    r =>
      r.config_type === 'employee' &&
      r.config_value === employeeId &&
      r.review_period != null &&
      r.review_year != null,
  );

  const exact = empRows.find(r => r.review_period === period && r.review_year === year);

  if (!resolved) {
    return {
      templateId: null,
      displayName: null,
      stages: [],
      source: 'none',
      effectiveFrom: null,
    };
  }

  const base: Omit<ResolvedMapping, 'source' | 'effectiveFrom'> = {
    templateId: resolved.template_id,
    displayName: resolved.display_name,
    stages: resolved.stages ?? [],
  };

  if (resolved.config_source === 'employee') {
    if (exact) {
      return { ...base, source: 'employee_exact', effectiveFrom: null };
    }
    // Most recent employee row at or before (period, year).
    const carried = empRows
      .filter(r => monthOrdinal(r.review_period as string, r.review_year as number) <= target)
      .sort(
        (a, b) =>
          monthOrdinal(b.review_period as string, b.review_year as number) -
          monthOrdinal(a.review_period as string, a.review_year as number),
      )[0];
    return {
      ...base,
      source: 'employee_earlier_month',
      effectiveFrom: carried
        ? { period: carried.review_period as string, year: carried.review_year as number }
        : null,
    };
  }

  const map: Record<InlineResolvedInfo['config_source'], MappingSource> = {
    employee: 'employee_exact',
    department: 'department',
    pms_grade: 'pms_grade',
    default: 'default',
  };

  return { ...base, source: map[resolved.config_source] ?? 'default', effectiveFrom: null };
}

export function sourceLabel(m: ResolvedMapping): string {
  switch (m.source) {
    case 'employee_exact':
      return 'Set for this month';
    case 'employee_earlier_month':
      return m.effectiveFrom
        ? `Carried from ${m.effectiveFrom.period} ${m.effectiveFrom.year}`
        : 'Carried from an earlier month';
    case 'department':
      return 'Department default';
    case 'pms_grade':
      return 'PMS grade default';
    case 'default':
      return 'Global default';
    case 'none':
      return 'No workflow resolved';
  }
}
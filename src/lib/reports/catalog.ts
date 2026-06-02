/**
 * Report Catalog — SEED source for `report_registry` and `report_field_registry`.
 *
 * Report IDs follow `RPT-<MODULE>-<NNN>` and are IMMUTABLE once shipped.
 * Field keys per report are also IMMUTABLE — UI may rename their display label,
 * never the underlying key.
 */
import type { ReportFieldRegistryRow, ReportRegistryRow } from './types';

type ReportSeed = Omit<ReportRegistryRow, 'is_active' | 'sort_order'> & {
  is_active?: boolean;
  sort_order?: number;
  fields?: Array<Omit<ReportFieldRegistryRow, 'report_id'>>;
};

function r(
  report_id: string,
  report_key: string,
  module_prefix: string,
  display_name: string,
  canonical_route: string,
  menu_key: string | null,
  fields: ReportSeed['fields'] = [],
  sort_order = 0,
  description: string | null = null,
): ReportSeed {
  return { report_id, report_key, module_prefix, display_name, canonical_route, menu_key, description, sort_order, fields };
}

function f(
  field_key: string,
  default_label: string,
  default_sort: number,
  opts: Partial<Omit<ReportFieldRegistryRow, 'field_key' | 'default_label' | 'default_sort' | 'report_id'>> = {},
): Omit<ReportFieldRegistryRow, 'report_id'> {
  return {
    field_key,
    default_label,
    default_sort,
    is_required: opts.is_required ?? false,
    is_renamable: opts.is_renamable ?? true,
    data_type: opts.data_type ?? null,
  };
}

export const REPORT_CATALOG: ReportSeed[] = [
  r('RPT-PERF-001', 'performance', 'PERF', 'Performance Report', '/reports/performance', 'reports-performance', [
    f('category',    'Category',      10, { is_required: true,  data_type: 'string' }),
    f('kpi_count',   'KPI Count',     20, { data_type: 'number' }),
    f('avg_score',   'Average Score', 30, { data_type: 'number' }),
  ], 10),
  r('RPT-INC-001',  'incentive',         'INC',  'Incentive Report',         '/reports/incentive',         'reports-incentive', [], 20),
  r('RPT-KRA-001',  'kra-issuance',      'KRA',  'KRA Issuance Report',      '/reports/kra-issuance',      'reports-kra-issuance', [], 30),
  r('RPT-TNI-001',  'tni',               'TNI',  'Training Needs (TNI)',     '/reports/tni',               'reports-tni', [], 40),
  r('RPT-EPS-001',  'employee-summary',  'EPS',  'Employee Performance Summary','/reports/employee-summary',null, [], 50),
  r('RPT-MSR-001',  'monthly-scorecard', 'MSR',  'Monthly Scorecard',        '/reports/monthly-scorecard', null, [], 60),
  r('RPT-QRY-001',  'queries',           'QRY',  'Query Report',             '/reports/queries',           null, [], 70),
  r('RPT-ISS-001',  'issues',            'ISS',  'Unified Issues Report',    '/reports/issues',            null, [], 80),
  r('RPT-CMP-001',  'completion',        'CMP',  'Completion Rate Report',   '/reports/completion',        null, [], 90),
  r('RPT-DEP-001',  'department',        'DEP',  'Department Summary',       '/reports/department',        null, [], 100),
  r('RPT-AUD-001',  'audit-trail',       'AUD',  'Audit Trail Report',       '/reports/audit-trail',       null, [], 110),
  r('RPT-KPID-001', 'kpi-detail',        'KPID', 'KPI Detail Report',        '/reports/kpi-detail',        null, [], 120),
  r('RPT-BNK-001',  'bottleneck',        'BNK',  'Workflow Bottleneck Report','/reports/bottleneck',       null, [], 130),
  r('RPT-KST-001',  'kpi-status-tracker','KST',  'KPI Status Tracker',       '/reports/kpi-status-tracker',null, [], 140),
  r('RPT-KJN-001',  'kpi-journey',       'KJN',  'KPI Journey Timeline',     '/reports/kpi-journey',       null, [], 150),
  r('RPT-VAR-001',  'variance',          'VAR',  'Variance Report',          '/reports/variance',          null, [], 160),
  r('RPT-MTK-001',  'manager-team-kpi',  'MTK',  'Same KPI — Manager vs Team','/reports/manager-team-kpi', null, [], 170),
  r('RPT-TVM-001',  'team-vs-manager-score','TVM','Team Vs Manager Monthly Score','/reports/team-vs-manager-score', null, [], 180),
  r('RPT-KSD-001',  'kpi-scorecard-detail','KSD','KPI Scorecard Detail',     '/reports/kpi-scorecard-detail', null, [], 190),
  r('RPT-MAT-001',  'kpi-employee-matrix','MAT', 'KPI-Employee Score Matrix','/reports/kpi-employee-matrix', null, [], 200),
];

export const REPORT_CATALOG_BY_ID: Record<string, ReportSeed> = Object.fromEntries(
  REPORT_CATALOG.map((rep) => [rep.report_id, rep]),
);

export const REPORT_CATALOG_BY_KEY: Record<string, ReportSeed> = Object.fromEntries(
  REPORT_CATALOG.map((rep) => [rep.report_key, rep]),
);

/** Helper: split into registry rows + field rows for the seeder. */
export function flattenCatalog(): {
  reports: ReportRegistryRow[];
  fields: ReportFieldRegistryRow[];
} {
  const reports: ReportRegistryRow[] = REPORT_CATALOG.map((rep) => ({
    report_id: rep.report_id,
    report_key: rep.report_key,
    module_prefix: rep.module_prefix,
    display_name: rep.display_name,
    canonical_route: rep.canonical_route,
    menu_key: rep.menu_key,
    description: rep.description ?? null,
    is_active: rep.is_active ?? true,
    sort_order: rep.sort_order ?? 0,
  }));
  const fields: ReportFieldRegistryRow[] = REPORT_CATALOG.flatMap((rep) =>
    (rep.fields ?? []).map((fld) => ({ ...fld, report_id: rep.report_id })),
  );
  return { reports, fields };
}

/** Helper: derive Report ID from a canonical route, if any. */
export function getReportIdFromRoute(route: string): string | null {
  const match = REPORT_CATALOG.find((rep) => rep.canonical_route === route);
  return match ? match.report_id : null;
}

/** Helper: resolve canonical route from a Report ID. */
export function getRouteFromReportId(reportId: string): string | null {
  return REPORT_CATALOG_BY_ID[reportId]?.canonical_route ?? null;
}
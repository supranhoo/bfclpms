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
  r('RPT-KRA-001',  'kra-issuance',      'KRA',  'KRA Issuance Report',      '/reports/kra-issuance',      'reports-kra-issuance', [
    f('category',    'Category',      10, { is_required: true, data_type: 'string' }),
    f('total',       'Total KPIs',    20, { data_type: 'number' }),
    f('approved',    'Approved',      30, { data_type: 'number' }),
    f('completion',  'Completion',    40, { data_type: 'string' }),
  ], 30),
  r('RPT-TNI-001',  'tni',               'TNI',  'Training Needs (TNI)',     '/reports/tni',               'reports-tni', [
    f('company',                 'Company',                 10, { data_type: 'string' }),
    f('employee_name',           'Employee Name',           20, { is_required: true, data_type: 'string' }),
    f('employee_code',           'Employee Code',           30, { is_required: true, data_type: 'string' }),
    f('department',              'Department',              40, { data_type: 'string' }),
    f('designation',             'Designation',             50, { data_type: 'string' }),
    f('kpi',                     'KPI',                     60, { data_type: 'string' }),
    f('kra',                     'KRA',                     70, { data_type: 'string' }),
    f('category',                'Category',                80, { data_type: 'string' }),
    f('score',                   'Score',                   90, { data_type: 'number' }),
    f('gap_type',                'Gap Type',               100, { data_type: 'string' }),
    f('priority',                'Priority',               110, { data_type: 'string' }),
    f('status',                  'Status',                 120, { data_type: 'string' }),
    f('training_recommendation', 'Training Recommendation',130, { data_type: 'string' }),
    f('period',                  'Period',                 140, { data_type: 'string' }),
    f('year',                    'Year',                   150, { data_type: 'number' }),
  ], 40),
  r('RPT-EPS-001',  'employee-summary',  'EPS',  'Employee Performance Summary','/reports/employee-summary',null, [
    f('company',            'Company',            10, { data_type: 'string' }),
    f('month',              'Month',              20, { data_type: 'string' }),
    f('employee_id',        'Employee ID',        30, { is_required: true, data_type: 'string' }),
    f('full_name',          'Full Name',          40, { is_required: true, data_type: 'string' }),
    f('division',           'Division',           50, { data_type: 'string' }),
    f('department',         'Department',         60, { data_type: 'string' }),
    f('designation',        'Designation',        70, { data_type: 'string' }),
    f('reporting_manager',  'Reporting Manager',  80, { data_type: 'string' }),
    f('functional_manager', 'Functional Manager', 90, { data_type: 'string' }),
    f('review_status',      'Review Status',     100, { data_type: 'string' }),
    f('total_score',        'Total Score',       110, { data_type: 'number' }),
    f('out_of_score',       'Out of Score',      120, { data_type: 'number' }),
    f('overall_rating',     'Overall Rating',    130, { data_type: 'string' }),
    f('percentage',         'Percentage',        140, { data_type: 'string' }),
  ], 50),
  r('RPT-MSR-001',  'monthly-scorecard', 'MSR',  'Monthly Scorecard',        '/reports/monthly-scorecard', null, [], 60),
  r('RPT-QRY-001',  'queries',           'QRY',  'Query Report',             '/reports/queries',           null, [
    f('company',          'Company',          10, { data_type: 'string' }),
    f('ticket_number',    'Ticket #',         20, { data_type: 'string' }),
    f('kpi',              'KPI',              30, { is_required: true, data_type: 'string' }),
    f('kra',              'KRA',              40, { data_type: 'string' }),
    f('employee',         'Employee',         50, { data_type: 'string' }),
    f('raised_by',        'Raised By',        60, { data_type: 'string' }),
    f('raised_to',        'Raised To',        70, { data_type: 'string' }),
    f('reason',           'Reason',           80, { data_type: 'string' }),
    f('status',           'Status',           90, { data_type: 'string' }),
    f('created_date',     'Created Date',    100, { data_type: 'date' }),
    f('days_open',        'Days Open',       110, { data_type: 'number' }),
    f('resolution_notes', 'Resolution Notes',120, { data_type: 'string' }),
  ], 70),
  r('RPT-ISS-001',  'issues',            'ISS',  'Unified Issues Report',    '/reports/issues',            null, [
    f('issue_type',    'Issue Type',    10, { is_required: true, data_type: 'string' }),
    f('subject',       'Subject',       20, { is_required: true, data_type: 'string' }),
    f('description',   'Description',   30, { data_type: 'string' }),
    f('employee',      'Employee',      40, { data_type: 'string' }),
    f('department',    'Department',    50, { data_type: 'string' }),
    f('assigned_to',   'Assigned To',   60, { data_type: 'string' }),
    f('status',        'Status',        70, { data_type: 'string' }),
    f('priority',      'Priority',      80, { data_type: 'string' }),
    f('age_days',      'Age (Days)',    90, { data_type: 'number' }),
    f('created_date',  'Created Date', 100, { data_type: 'date' }),
  ], 80),
  r('RPT-CMP-001',  'completion',        'CMP',  'Completion Rate Report',   '/reports/completion',        null, [
    f('period',                 'Period',                 10, { is_required: true, data_type: 'string' }),
    f('year',                   'Year',                   20, { is_required: true, data_type: 'number' }),
    f('total_kpis',             'Total KPIs',             30, { data_type: 'number' }),
    f('self_review_submitted',  'Self Review Submitted',  40, { data_type: 'number' }),
    f('manager_reviewed',       'Manager Reviewed',       50, { data_type: 'number' }),
    f('skip_level_reviewed',    'Skip-Level Reviewed',    60, { data_type: 'number' }),
    f('hr_pms_reviewed',        'HR PMS Reviewed',        70, { data_type: 'number' }),
    f('auditor_reviewed',       'Auditor Reviewed',       80, { data_type: 'number' }),
    f('approved',               'Approved',               90, { data_type: 'number' }),
    f('not_submitted',          'Not Submitted',         100, { data_type: 'number' }),
    f('self_review_rate',       'Self Review Rate',      110, { data_type: 'string' }),
    f('completion_rate',        'Completion Rate',       120, { data_type: 'string' }),
  ], 90),
  r('RPT-DEP-001',  'department',        'DEP',  'Department Summary',       '/reports/department',        null, [
    f('department',        'Department',         10, { is_required: true, data_type: 'string' }),
    f('division',          'Division',           20, { data_type: 'string' }),
    f('business_unit',     'Business Unit',      30, { data_type: 'string' }),
    f('total_employees',   'Total Employees',    40, { data_type: 'number' }),
    f('total_kpis',        'Total KPIs',         50, { data_type: 'number' }),
    f('approved',          'Approved',           60, { data_type: 'number' }),
    f('completion_rate',   'Completion Rate',    70, { data_type: 'string' }),
    f('kra_set',           'KRA Set',            80, { data_type: 'number' }),
    f('self_review',       'Self Review',        90, { data_type: 'number' }),
    f('manager_check',     'Manager Check',     100, { data_type: 'number' }),
    f('skip_level_check',  'Skip-Level Check',  110, { data_type: 'number' }),
    f('hr_pms_review',     'HR PMS Review',     120, { data_type: 'number' }),
    f('audit',             'Audit',             130, { data_type: 'number' }),
    f('management_review', 'Management Review', 140, { data_type: 'number' }),
  ], 100),
  r('RPT-AUD-001',  'audit-trail',       'AUD',  'Audit Trail Report',       '/reports/audit-trail',       null, [
    f('timestamp',        'Timestamp',        10, { is_required: true, data_type: 'date' }),
    f('action',           'Action',           20, { is_required: true, data_type: 'string' }),
    f('kpi_name',         'KPI Name',         30, { data_type: 'string' }),
    f('kra_name',         'KRA Name',         40, { data_type: 'string' }),
    f('review_period',    'Review Period',    50, { data_type: 'string' }),
    f('review_year',      'Review Year',      60, { data_type: 'number' }),
    f('performed_by',     'Performed By',     70, { data_type: 'string' }),
    f('performer_email',  'Performer Email',  80, { data_type: 'string' }),
    f('on_behalf_of',     'On Behalf Of',     90, { data_type: 'string' }),
    f('on_behalf_role',   'On Behalf Role',  100, { data_type: 'string' }),
    f('admin_reason',     'Admin Reason',    110, { data_type: 'string' }),
    f('details',          'Details',         120, { data_type: 'string' }),
  ], 110),
  r('RPT-KPID-001', 'kpi-detail',        'KPID', 'KPI Detail Report',        '/reports/kpi-detail',        null, [
    f('company',        'Company',        10, { data_type: 'string' }),
    f('employee_code',  'Employee Code',  20, { is_required: true, data_type: 'string' }),
    f('employee_name',  'Employee Name',  30, { is_required: true, data_type: 'string' }),
    f('department',     'Department',     40, { data_type: 'string' }),
    f('category',       'Category',       50, { data_type: 'string' }),
    f('kra',            'KRA',            60, { data_type: 'string' }),
    f('kpi',            'KPI',            70, { data_type: 'string' }),
    f('month',          'Month',          80, { data_type: 'string' }),
    f('weightage',      'Weightage',      90, { data_type: 'number' }),
    f('self',           'Self',          100, { data_type: 'number' }),
    f('manager',        'Manager',       110, { data_type: 'number' }),
    f('skip_level',     'Skip-Level',    120, { data_type: 'number' }),
    f('hr_pms',         'HR PMS',        130, { data_type: 'number' }),
    f('auditor',        'Auditor',       140, { data_type: 'number' }),
    f('mgmt',           'Mgmt',          150, { data_type: 'number' }),
    f('final',          'Final',         160, { data_type: 'number' }),
    f('total_score',    'Total Score',   170, { data_type: 'number' }),
    f('out_of_score',   'Out of Score',  180, { data_type: 'number' }),
    f('overall_rating', 'Overall Rating',190, { data_type: 'string' }),
    f('percentage',     'Percentage',    200, { data_type: 'string' }),
  ], 120),
  r('RPT-BNK-001',  'bottleneck',        'BNK',  'Workflow Bottleneck Report','/reports/bottleneck',       null, [
    f('company',            'Company',            10, { data_type: 'string' }),
    f('emp_code',           'Emp Code',           20, { is_required: true, data_type: 'string' }),
    f('employee_name',      'Employee Name',      30, { is_required: true, data_type: 'string' }),
    f('department',         'Department',         40, { data_type: 'string' }),
    f('kra',                'KRA',                50, { data_type: 'string' }),
    f('kpi_name',           'KPI Name',           60, { data_type: 'string' }),
    f('period',             'Period',             70, { data_type: 'string' }),
    f('year',               'Year',               80, { data_type: 'number' }),
    f('current_stage',      'Current Stage',      90, { data_type: 'string' }),
    f('responsible_person', 'Responsible Person',100, { data_type: 'string' }),
    f('days_pending',       'Days Pending',      110, { data_type: 'number' }),
    f('last_updated',       'Last Updated',      120, { data_type: 'date' }),
  ], 130),
  r('RPT-KST-001',  'kpi-status-tracker','KST',  'KPI Status Tracker',       '/reports/kpi-status-tracker',null, [
    f('row_num',          '#',                 10, { is_required: true, is_renamable: false, data_type: 'number' }),
    f('company',          'Company',           20, { data_type: 'string' }),
    f('employee_code',    'Employee Code',     30, { is_required: true, data_type: 'string' }),
    f('employee_name',    'Employee Name',     40, { is_required: true, data_type: 'string' }),
    f('designation',      'Designation',       50, { data_type: 'string' }),
    f('department',       'Department',        60, { data_type: 'string' }),
    f('division',         'Division',          70, { data_type: 'string' }),
    f('category',         'Category',          80, { data_type: 'string' }),
    f('kra',              'KRA',               90, { data_type: 'string' }),
    f('kpi',              'KPI',              100, { data_type: 'string' }),
    f('weightage',        'Weightage',        110, { data_type: 'number' }),
    f('frequency',        'Frequency',        120, { data_type: 'string' }),
    f('current_status',   'Current Status',   130, { data_type: 'string' }),
    f('pending_at_level', 'Pending At Level', 140, { data_type: 'string' }),
    f('days_in_stage',    'Days in Stage',    150, { data_type: 'number' }),
    f('org_level',        'Org-Level',        160, { data_type: 'string' }),
  ], 140),
  r('RPT-KJN-001',  'kpi-journey',       'KJN',  'KPI Journey Timeline',     '/reports/kpi-journey',       null, [], 150),
  r('RPT-VAR-001',  'variance',          'VAR',  'Variance Report',          '/reports/variance',          null, [
    f('company',           'Company',          10, { data_type: 'string' }),
    f('employee_code',     'Employee Code',    20, { is_required: true, data_type: 'string' }),
    f('employee_name',     'Employee Name',    30, { is_required: true, data_type: 'string' }),
    f('department',        'Department',       40, { data_type: 'string' }),
    f('category',          'Category',         50, { data_type: 'string' }),
    f('kra',               'KRA',              60, { data_type: 'string' }),
    f('kpi',               'KPI',              70, { data_type: 'string' }),
    f('month',             'Month',            80, { data_type: 'string' }),
    f('auditor_score',     'Auditor Score',    90, { data_type: 'number' }),
    f('management_score',  'Management Score',100, { data_type: 'number' }),
    f('variance',          'Variance',        110, { data_type: 'number' }),
  ], 160),
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
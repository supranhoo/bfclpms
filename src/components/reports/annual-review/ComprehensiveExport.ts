import * as XLSX from 'xlsx';
import type { ComprehensiveRow, KpiSummary, GroupSummary } from '@/services/annualReview/comprehensiveReport';
import { pendingWith, eligibilityLabel, completionStatus, ratingDistribution } from '@/services/annualReview/comprehensiveReport';

export interface ExportInput {
  cycleName: string;
  rows: ComprehensiveRow[];
  summary: KpiSummary;
  byDepartment: GroupSummary[];
  byBusinessUnit: GroupSummary[];
  byDivision: GroupSummary[];
  byGrade: GroupSummary[];
  byDesignation: GroupSummary[];
  byStage: GroupSummary[];
}

function toEmployeeSheet(rows: ComprehensiveRow[]) {
  return rows.map((r) => ({
    'Employee Code': r.employee_code ?? '',
    'Name': r.employee_name ?? '',
    'Designation': r.designation ?? '',
    'Department': r.department_name ?? '',
    'Business Unit': r.business_unit_name ?? '',
    'Division': r.division_name ?? '',
    'Grade': r.grade ?? '',
    'Date of Joining': r.doj ?? '',
    'Eligibility': eligibilityLabel(r),
    'Self Score': r.self_score ?? '',
    'HOD Score': r.dept_head_score ?? r.manager_score ?? '',
    'BU Head Score': r.bu_head_score ?? '',
    'HR Score': r.hr_score ?? '',
    'Final Score': r.total_score ?? '',
    'Rating': r.final_rating ?? '',
    'Current Stage': pendingWith(r.overall_status),
    'Pending With': r.overall_status === 'completed' || r.is_excluded
      ? '—'
      : (r.overall_status === 'pending_self'
          ? (r.employee_name ?? 'Self')
          : r.overall_status === 'pending_manager' ? (r.manager_name ?? 'Manager')
          : r.overall_status === 'pending_dept' ? (r.dept_head_name ?? 'Dept Head')
          : r.overall_status === 'pending_bu' ? (r.bu_head_name ?? 'BU Head')
          : r.overall_status === 'pending_hr' ? (r.hr_name ?? 'HR')
          : pendingWith(r.overall_status)),
    'Completion Status': completionStatus(r.overall_status),
    'Days Since Update': r.days_pending ?? '',
  }));
}

function summaryToSheet(s: KpiSummary, cycleName: string) {
  return [
    { Metric: 'Cycle', Value: cycleName },
    { Metric: 'Total employees', Value: s.total },
    { Metric: 'Eligible', Value: s.eligible },
    { Metric: 'Excluded', Value: s.excluded },
    { Metric: 'Pending — Self', Value: s.pending_self },
    { Metric: 'Pending — HOD/Manager', Value: s.pending_hod },
    { Metric: 'Pending — BU Head', Value: s.pending_bu },
    { Metric: 'Pending — HR', Value: s.pending_hr },
    { Metric: 'In progress (any middle stage)', Value: s.in_progress },
    { Metric: 'Completed', Value: s.completed },
    { Metric: 'Average final score', Value: s.avg_final != null ? Number(s.avg_final.toFixed(2)) : '' },
  ];
}

function groupToSheet(g: GroupSummary[]) {
  return g.map((r) => ({
    Name: r.name,
    Total: r.total,
    Eligible: r.eligible,
    Excluded: r.excluded,
    'Self Done': r.self_done,
    'HOD Done': r.hod_done,
    'BU Done': r.bu_done,
    'HR Done': r.hr_done,
    Completed: r.completed,
    'Submission %': r.submission_pct,
    'Avg Final': r.avg_final ?? '',
  }));
}

export function downloadComprehensiveWorkbook(input: ExportInput) {
  const wb = XLSX.utils.book_new();
  const append = (name: string, data: unknown[]) => {
    if (!data || data.length === 0) return;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data as any), name);
  };
  append('Executive Summary', summaryToSheet(input.summary, input.cycleName));
  append('Employees', toEmployeeSheet(input.rows));
  append('Rating Distribution', ratingDistribution(input.rows));
  append('By Department', groupToSheet(input.byDepartment));
  append('By Business Unit', groupToSheet(input.byBusinessUnit));
  append('By Division', groupToSheet(input.byDivision));
  append('By Grade', groupToSheet(input.byGrade));
  append('By Designation', groupToSheet(input.byDesignation));
  append('By Stage', groupToSheet(input.byStage));
  XLSX.writeFile(wb, `annual-review-report-${new Date().toISOString().slice(0,10)}.xlsx`);
}
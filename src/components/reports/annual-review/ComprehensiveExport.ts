import * as XLSX from 'xlsx';
import type { ComprehensiveRow, KpiSummary, GroupSummary } from '@/services/annualReview/comprehensiveReport';
import { pendingWith, eligibilityLabel, completionStatus, ratingDistribution, diagnoseHr, stageRatingDisplay } from '@/services/annualReview/comprehensiveReport';
import {
  fetchTemplateLabelMaps, formatScoreMap, type TemplateLabelMaps,
} from '@/services/annualReview/criteriaScoreLabels';

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

function toEmployeeSheet(rows: ComprehensiveRow[], labelMaps: TemplateLabelMaps) {
  return rows.map((r) => {
    const diag = diagnoseHr(r);
    const hodScore = r.dept_head_score ?? r.manager_score ?? null;
    const hodComment = r.dept_head_comment ?? r.manager_comment ?? '';
    // ADR-155 — dept=BU collapse: blank the HOD columns to avoid a
    // duplicated reviewer showing up in exports.
    const deptCollapsedIntoBu =
      !!r.dept_head_id && !!r.bu_head_id && r.dept_head_id === r.bu_head_id;
    return ({
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
    'Self Rating': stageRatingDisplay(r.self_score, r.self_comment),
    'Self Rating (/5)': r.self_rating_5 ?? '',
    'Self Comment': r.self_comment ?? '',
    'HOD Score': deptCollapsedIntoBu ? '' : (hodScore ?? ''),
    'HOD Rating': deptCollapsedIntoBu ? '' : stageRatingDisplay(hodScore, hodComment),
    'HOD Rating (/5)': deptCollapsedIntoBu
      ? ''
      : ((r.dept_head_rating_5 ?? r.manager_rating_5) ?? ''),
    'HOD Comment': deptCollapsedIntoBu ? '' : hodComment,
    'BU Head Score': r.bu_head_score ?? '',
    'BU Head Rating': stageRatingDisplay(r.bu_head_score, r.bu_head_comment),
    'BU Head Rating (/5)': r.bu_head_rating_5 ?? '',
    'BU Head Comment': r.bu_head_comment ?? '',
    'HR Score': r.hr_score ?? '',
    'HR Rating': stageRatingDisplay(r.hr_score, r.hr_comment),
    'HR Rating (/5)': r.hr_rating_5 ?? '',
    'Management Rating (/5)': r.management_rating_5 ?? '',
    'HR Comment': r.hr_comment ?? '',
    'Final Score': r.total_score ?? '',
    'Rating': r.final_rating ?? '',
    // ADR-174 — how the rating was derived + the raw scoring parameters.
    'Rating Derived From': r.scoring_mode ?? '',
    // ADR-179 — whether the /5 stage ratings came from criteria or KRA.
    'Stage Rating Source': r.rating_source ?? '',
    'Template': r.template_name ?? '',
    'KRA Weight': r.kra_weight ?? '',
    'KRA Points': r.kra_points ?? '',
    'Criteria Weight': r.criteria_weight ?? '',
    'System Weight': r.system_weight ?? '',
    // ADR-180 — humanised score maps (criterion / system-score names, not ids).
    'System Scores': formatScoreMap(
      r.system_scores,
      r.template_id ? labelMaps.system[r.template_id] : undefined,
    ),
    'Criteria Scores (final reviewer)': formatScoreMap(
      r.terminal_criteria_scores,
      r.template_id ? labelMaps.criteria[r.template_id] : undefined,
    ),
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
    'HR Data Available': diag.hr_data_available ? 'Yes' : 'No',
    'HR Data Visible in Report': diag.hr_data_visible ? 'Yes' : 'No',
    'Root Cause': diag.root_cause,
    'Evidence': diag.evidence,
    'Impact': diag.impact,
    'Recommended Fix': diag.recommended_fix,
    });
  });
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

export async function downloadComprehensiveWorkbook(input: ExportInput) {
  // ADR-180 — resolve criterion / system-score labels once per export.
  const labelMaps = await fetchTemplateLabelMaps(input.rows.map((r) => r.template_id));
  const wb = XLSX.utils.book_new();
  const append = (name: string, data: unknown[]) => {
    if (!data || data.length === 0) return;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data as any), name);
  };
  append('Executive Summary', summaryToSheet(input.summary, input.cycleName));
  append('Employees', toEmployeeSheet(input.rows, labelMaps));
  append('Rating Distribution', ratingDistribution(input.rows));
  append('By Department', groupToSheet(input.byDepartment));
  append('By Business Unit', groupToSheet(input.byBusinessUnit));
  append('By Division', groupToSheet(input.byDivision));
  append('By Grade', groupToSheet(input.byGrade));
  append('By Designation', groupToSheet(input.byDesignation));
  append('By Stage', groupToSheet(input.byStage));
  XLSX.writeFile(wb, `annual-review-report-${new Date().toISOString().slice(0,10)}.xlsx`);
}
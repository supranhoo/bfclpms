/**
 * Standalone Excel template generators for the four bulk dataset operations.
 *
 * Mirrors the per-dialog `handleExport` implementations in:
 *   - SystemScoresUploadDialog
 *   - BulkTemplateAssignmentDialog
 *   - BulkWorkflowAssignmentDialog
 *   - BulkStageWeightsAssignmentDialog
 *
 * Exposed separately so the consolidated `Download data` menu on the
 * Annual Review Admin toolbar can generate any template without first
 * mounting the matching upload dialog.
 *
 * The schema (headers + column order) is the SAME as each dialog's
 * existing handleExport — if you change one, change the other.
 */
import * as XLSX from 'xlsx';
import type { AnnualReviewCycle, AnnualReviewTemplate } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import * as svc from '@/services/annualReview/annualReviewService';
import { describeChain, enabledChain } from '@/lib/annualReview/stageChain';
import {
  resolveStageWeights, STAGE_WEIGHT_KEYS,
  type StageWeightKey, type StageWeights,
} from '@/lib/annualReview/finalScore';

const COL_WEIGHTS: Record<StageWeightKey, string> = {
  self: 'Self %',
  manager: 'Manager %',
  skip_manager: 'Skip %',
  dept_head: 'Dept Head %',
  bu_head: 'BU Head %',
  hr: 'HR %',
  system: 'System %',
  criteria: 'Criteria %',
};

function describeBlend(w: StageWeights): string {
  const parts = STAGE_WEIGHT_KEYS
    .map((k) => ({ k, v: Number(w[k] ?? 0) }))
    .filter((x) => x.v > 0)
    .map((x) => `${x.k} ${x.v}%`);
  return parts.length ? parts.join(' · ') : '—';
}

function save(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function buildSystemScoresWorkbook(
  template: AnnualReviewTemplate,
  rows: InstanceWithEmployee[],
): XLSX.WorkBook {
  const systemCols = template.sections.system_scores ?? [];
  const eligCols = template.sections.eligibility_criteria ?? [];
  const headers = ['Employee Code', 'Full Name', ...systemCols.map((s) => s.name), ...eligCols.map((c) => c.name)];
  const data = rows.map((r) => {
    const base: Record<string, unknown> = {
      'Employee Code': r.employee?.employee_code ?? '',
      'Full Name': r.employee?.full_name ?? '',
    };
    for (const s of systemCols) base[s.name] = r.system_scores?.[s.id] ?? '';
    for (const c of eligCols) base[c.name] = (r.eligibility_inputs as Record<string, unknown>)?.[c.id] ?? '';
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Annual Review');
  return wb;
}

export function downloadSystemScoresTemplate(
  cycle: AnnualReviewCycle, template: AnnualReviewTemplate, rows: InstanceWithEmployee[],
) {
  save(buildSystemScoresWorkbook(template, rows), `annual-review-${cycle.review_year}-system-scores.xlsx`);
}

export function buildTemplateAssignmentWorkbook(
  templates: AnnualReviewTemplate[],
  instances: InstanceWithEmployee[],
): XLSX.WorkBook {
  const tplById = new Map(templates.map((t) => [t.id, t]));
  const headers = ['Employee Code', 'Full Name', 'Current Template', 'Stage', 'New Template', 'Reason'];
  const data = instances.map((i) => {
    const currentId = svc.resolveTemplateId(i);
    return {
      'Employee Code': i.employee?.employee_code ?? '',
      'Full Name': i.employee?.full_name ?? '',
      'Current Template': currentId ? tplById.get(currentId)?.name ?? '' : '',
      'Stage': i.overall_status,
      'New Template': '',
      'Reason': '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Templates');
  return wb;
}

export function downloadTemplateAssignmentTemplate(
  cycle: AnnualReviewCycle, templates: AnnualReviewTemplate[], instances: InstanceWithEmployee[],
) {
  save(buildTemplateAssignmentWorkbook(templates, instances), `annual-review-${cycle.review_year}-bulk-template-assignment.xlsx`);
}

export function buildWorkflowAssignmentWorkbook(
  instances: InstanceWithEmployee[],
): XLSX.WorkBook {
  const headers = ['Employee Code', 'Full Name', 'Current Stages', 'Self (Y/N)', 'Manager (Y/N)', 'Skip (Y/N)', 'BU (Y/N)', 'HR (Y/N)', 'Reason'];
  const data = instances.map((i) => {
    const chain = enabledChain(i.enabled_stages);
    const has = (s: 'self' | 'manager' | 'skip_manager' | 'bu_head' | 'hr') => (chain.includes(s) ? 'Y' : 'N');
    return {
      'Employee Code': i.employee?.employee_code ?? '',
      'Full Name': i.employee?.full_name ?? '',
      'Current Stages': describeChain(i.enabled_stages),
      'Self (Y/N)': has('self'),
      'Manager (Y/N)': has('manager'),
      'Skip (Y/N)': has('skip_manager'),
      'BU (Y/N)': has('bu_head'),
      'HR (Y/N)': has('hr'),
      'Reason': '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Workflows');
  return wb;
}

export function downloadWorkflowAssignmentTemplate(
  cycle: AnnualReviewCycle, instances: InstanceWithEmployee[],
) {
  save(buildWorkflowAssignmentWorkbook(instances), `annual-review-${cycle.review_year}-bulk-workflow-assignment.xlsx`);
}

export function buildStageWeightsWorkbook(
  instances: InstanceWithEmployee[],
  templatesById: Map<string, AnnualReviewTemplate>,
): XLSX.WorkBook {
  const headers = [
    'Employee Code', 'Full Name', 'Current Blend',
    ...STAGE_WEIGHT_KEYS.map((k) => COL_WEIGHTS[k]),
    'Reason',
  ];
  const data = instances.map((i) => {
    const tplId = svc.resolveTemplateId(i);
    const tpl = tplId ? templatesById.get(tplId) ?? null : null;
    const eff = resolveStageWeights(i, tpl);
    const row: Record<string, unknown> = {
      'Employee Code': i.employee?.employee_code ?? '',
      'Full Name': i.employee?.full_name ?? '',
      'Current Blend': describeBlend(eff),
    };
    for (const k of STAGE_WEIGHT_KEYS) row[COL_WEIGHTS[k]] = eff[k] ?? '';
    row['Reason'] = '';
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stage Weights');
  return wb;
}

export function downloadStageWeightsTemplate(
  cycle: AnnualReviewCycle,
  instances: InstanceWithEmployee[],
  templatesById: Map<string, AnnualReviewTemplate>,
) {
  save(buildStageWeightsWorkbook(instances, templatesById), `annual-review-${cycle.review_year}-bulk-stage-weights.xlsx`);
}
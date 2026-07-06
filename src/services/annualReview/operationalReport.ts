/**
 * Operational Status Report — Annual Review Admin.
 *
 * Two-sheet Excel export designed for day-to-day operations:
 *   Sheet 1 "Status Overview" — one row per instance, showing identity, org,
 *           assigned template, enabled stages, per-stage submission timing,
 *           and the currently pending stage/owner (the "who is stuck where"
 *           columns).
 *   Sheet 2 "Form Responses" — one row per (employee × field × reviewer stage)
 *           for both criteria scores and qualitative fields.
 *
 * Pure builder — no DB access. Callers hydrate all supporting data via
 * annualReviewService helpers and hand it in. Pagination is the caller's
 * responsibility (see AnnualReviewExportMenu.handleOperationalReport, which
 * chains `fetchAllInstancesForExport` + batched `.in()` lookups + a paged
 * `annual_review_responses` walk — POLICY §94/§109/§110).
 */
import * as XLSX from 'xlsx';
import type {
  AnnualReviewCycle,
  AnnualReviewInstance,
  AnnualReviewResponse,
  AnnualReviewTemplate,
  AnnualReviewerRole,
  AnnualReviewStatus,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from './annualReviewService';
import { resolveTemplateId } from './annualReviewService';
import { enabledChain } from '@/lib/annualReview/stageChain';
import { STAGE_TO_STATUS, STATUS_LABEL, STAGE_LABEL } from '@/lib/annualReview/constants';

const STAGE_ORDER: AnnualReviewerRole[] = ['self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr'];

/** Reverse of STAGE_TO_STATUS: which reviewer role owns each pending status. */
const STATUS_TO_STAGE: Partial<Record<AnnualReviewStatus, AnnualReviewerRole>> = {
  pending_self: 'self',
  pending_manager: 'manager',
  pending_skip: 'skip_manager',
  pending_dept: 'dept_head',
  pending_bu: 'bu_head',
  pending_hr: 'hr',
};

/** Which instance FK holds the owner user_id for a given reviewer stage. */
const STAGE_TO_OWNER_KEY: Record<AnnualReviewerRole, keyof AnnualReviewInstance> = {
  self: 'employee_id',
  manager: 'manager_id',
  skip_manager: 'skip_id',
  dept_head: 'dept_head_id',
  bu_head: 'bu_head_id',
  hr: 'hr_id',
};

export interface ProfileLite {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation?: string | null;
  department_id?: string | null;
  pms_grade?: string | null;
  level?: string | null;
}

export interface DeptLite { id: string; name: string | null; business_unit_id: string | null; }
export interface BuLite { id: string; name: string | null; }

export interface OperationalReportInput {
  cycle: AnnualReviewCycle;
  rows: InstanceWithEmployee[];
  /** From fetchInstanceStageScores. */
  stageScores: Record<string, Partial<Record<AnnualReviewerRole, number | null>>>;
  templatesById: Record<string, AnnualReviewTemplate>;
  /** All profiles needed: employees + reviewers (manager/skip/dept/bu/hr). */
  profilesById: Record<string, ProfileLite>;
  deptsById: Record<string, DeptLite>;
  buById: Record<string, BuLite>;
  /** Rule name lookup for `assigned_rule_id`. */
  rulesById: Record<string, { id: string; name: string | null }>;
  /** All submitted (or draft) responses, keyed by instance_id. */
  responsesByInstance: Record<string, AnnualReviewResponse[]>;
  /** Injected for tests. Defaults to Date.now(). */
  now?: Date;
}

function fmtName(p: ProfileLite | undefined | null): string {
  if (!p) return '';
  const name = p.full_name ?? '';
  const code = p.employee_code ?? '';
  if (name && code) return `${name} (${code})`;
  return name || code || '';
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string | null | undefined, to: Date): number | '' {
  if (!from) return '';
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return '';
  const ms = to.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Derive the reviewer stage that currently owns the instance (blank if terminal). */
export function deriveCurrentStage(inst: AnnualReviewInstance): AnnualReviewerRole | null {
  return STATUS_TO_STAGE[inst.overall_status] ?? null;
}

/** Map reviewer_role → submitted_at from a set of responses. */
export function stageSubmittedAtMap(responses: AnnualReviewResponse[] | undefined): Partial<Record<AnnualReviewerRole, string | null>> {
  const out: Partial<Record<AnnualReviewerRole, string | null>> = {};
  for (const r of responses ?? []) if (r.submitted_at) out[r.reviewer_role] = r.submitted_at;
  return out;
}

/** "Self → Manager → HR" style string, respecting enabled_stages. */
export function formatEnabledStages(enabled: AnnualReviewerRole[] | null | undefined): string {
  try {
    return enabledChain(enabled).map((s) => STAGE_LABEL[s]).join(' → ');
  } catch {
    return '';
  }
}

// ---------- Sheet 1 ----------

function buildStatusSheet(input: OperationalReportInput): XLSX.WorkSheet {
  const now = input.now ?? new Date();
  const cycleStart = input.cycle.self_review_start ?? input.cycle.created_at;

  const headers: string[] = [
    'Employee Name', 'Employee Code', 'Designation', 'Department', 'Business Unit',
    'PMS Grade', 'Level',
    'Reporting Manager', 'Skip-Level Manager', 'Dept Head', 'BU Head', 'HR Owner',
    'Assigned Template', 'Template Override?', 'Assignment Rule',
    'Enabled Stages', 'Stage Count',
    'Overall Status', 'Current Stage', 'Current Stage Owner',
    'Days in Current Stage', 'Days Since Cycle Start', 'Last Updated At',
  ];
  // Per-stage pairs (Submitted At + Score) for ALL 6 canonical stages so the
  // header shape is stable across templates. Blank cells for disabled stages
  // are meaningful: they indicate the stage is not mapped.
  for (const s of STAGE_ORDER) {
    headers.push(`${STAGE_LABEL[s]} Submitted At`);
    headers.push(`${STAGE_LABEL[s]} Score`);
  }
  headers.push('Criteria Weighted Score', 'Total Score', 'Final Rating',
    'Finalized At', 'Finalized By', 'Acknowledged At');

  const data: Record<string, unknown>[] = input.rows.map((inst) => {
    const emp = inst.employee ?? input.profilesById[inst.employee_id];
    const empFull = input.profilesById[inst.employee_id]; // for grade/level/department_id
    const dept = empFull?.department_id ? input.deptsById[empFull.department_id] : undefined;
    const bu = dept?.business_unit_id ? input.buById[dept.business_unit_id] : undefined;
    const tid = resolveTemplateId(inst);
    const tpl = tid ? input.templatesById[tid] : undefined;
    const chain = (() => { try { return enabledChain(inst.enabled_stages); } catch { return []; } })();
    const currentStage = deriveCurrentStage(inst);
    const ownerId = currentStage ? (inst[STAGE_TO_OWNER_KEY[currentStage]] as string | null) : null;
    const ownerProfile = ownerId ? input.profilesById[ownerId] : undefined;
    const submittedByStage = stageSubmittedAtMap(input.responsesByInstance[inst.id]);
    const scoresByStage = input.stageScores[inst.id] ?? {};
    const rule = inst.assigned_rule_id ? input.rulesById[inst.assigned_rule_id] : undefined;

    const row: Record<string, unknown> = {
      'Employee Name': emp?.full_name ?? '',
      'Employee Code': emp?.employee_code ?? '',
      'Designation': emp?.designation ?? '',
      'Department': dept?.name ?? '',
      'Business Unit': bu?.name ?? '',
      'PMS Grade': empFull?.pms_grade ?? '',
      'Level': empFull?.level ?? '',
      'Reporting Manager': fmtName(inst.manager_id ? input.profilesById[inst.manager_id] : null),
      'Skip-Level Manager': fmtName(inst.skip_id ? input.profilesById[inst.skip_id] : null),
      'Dept Head': fmtName(inst.dept_head_id ? input.profilesById[inst.dept_head_id] : null),
      'BU Head': fmtName(inst.bu_head_id ? input.profilesById[inst.bu_head_id] : null),
      'HR Owner': fmtName(inst.hr_id ? input.profilesById[inst.hr_id] : null),
      'Assigned Template': tpl?.name ?? '',
      'Template Override?': inst.template_override_id ? 'Yes' : 'No',
      'Assignment Rule': rule?.name ?? '',
      'Enabled Stages': formatEnabledStages(inst.enabled_stages),
      'Stage Count': chain.length || '',
      'Overall Status': STATUS_LABEL[inst.overall_status] ?? inst.overall_status,
      'Current Stage': currentStage ? STAGE_LABEL[currentStage] : (inst.overall_status === 'completed' ? '—' : ''),
      'Current Stage Owner': fmtName(ownerProfile),
      'Days in Current Stage': currentStage ? daysBetween(inst.updated_at, now) : '',
      'Days Since Cycle Start': daysBetween(cycleStart, now),
      'Last Updated At': fmtDate(inst.updated_at),
    };
    const chainSet = new Set(chain);
    for (const s of STAGE_ORDER) {
      const inChain = chainSet.has(s);
      row[`${STAGE_LABEL[s]} Submitted At`] = inChain ? fmtDate(submittedByStage[s] ?? null) : '';
      const score = scoresByStage[s];
      row[`${STAGE_LABEL[s]} Score`] = inChain && score != null ? Number(score.toFixed(2)) : '';
    }
    row['Criteria Weighted Score'] = inst.criteria_weighted_score ?? '';
    row['Total Score'] = inst.total_score ?? '';
    row['Final Rating'] = inst.final_rating ?? '';
    row['Finalized At'] = fmtDate(inst.finalized_at);
    row['Finalized By'] = inst.finalized_by ? fmtName(input.profilesById[inst.finalized_by]) : '';
    row['Acknowledged At'] = fmtDate(inst.acknowledged_at);
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(38, h.length + 2)) }));
  ws['!freeze'] = { xSplit: 3, ySplit: 1 };
  if (data.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: headers.length - 1 } }) };
  }
  return ws;
}

// ---------- Sheet 2 ----------

function buildResponsesSheet(input: OperationalReportInput): XLSX.WorkSheet {
  const headers = [
    'Employee Name', 'Employee Code', 'Department', 'Template Name',
    'Section', 'Field Key', 'Field Label', 'Max Score',
    'Reviewer Stage', 'Reviewer Name', 'Score / Response', 'Submitted At',
  ];
  const data: Record<string, unknown>[] = [];

  for (const inst of input.rows) {
    const emp = inst.employee ?? input.profilesById[inst.employee_id];
    const empFull = input.profilesById[inst.employee_id];
    const dept = empFull?.department_id ? input.deptsById[empFull.department_id] : undefined;
    const tid = resolveTemplateId(inst);
    const tpl = tid ? input.templatesById[tid] : undefined;
    const responses = input.responsesByInstance[inst.id] ?? [];
    if (!tpl || responses.length === 0) continue;

    const criteria = tpl.sections.criteria ?? [];
    const criterionById: Record<string, { id: string; name: string; max: number }> = {};
    for (const c of criteria) {
      const max = (c.max_score ?? (c.options && c.options.length > 0
        ? Math.max(...c.options.map((o) => o.score))
        : 5));
      criterionById[c.id] = { id: c.id, name: c.name, max };
      if (c.key) criterionById[c.key] = { id: c.id, name: c.name, max };
    }
    const selfFields = tpl.sections.self_review_fields ?? [];
    const selfFieldById: Record<string, { id: string; label: string }> = {};
    for (const f of selfFields) selfFieldById[f.id] = { id: f.id, label: f.label };

    for (const r of responses) {
      const reviewerName = fmtName(input.profilesById[r.reviewer_id]);
      const stageLabel = STAGE_LABEL[r.reviewer_role] ?? r.reviewer_role;

      // Criteria scores
      for (const [key, score] of Object.entries(r.criteria_scores ?? {})) {
        const c = criterionById[key];
        data.push({
          'Employee Name': emp?.full_name ?? '',
          'Employee Code': emp?.employee_code ?? '',
          'Department': dept?.name ?? '',
          'Template Name': tpl.name,
          'Section': 'Criteria',
          'Field Key': key,
          'Field Label': c?.name ?? key,
          'Max Score': c?.max ?? '',
          'Reviewer Stage': stageLabel,
          'Reviewer Name': reviewerName,
          'Score / Response': score,
          'Submitted At': fmtDate(r.submitted_at),
        });
      }
      // Qualitative responses
      for (const [key, text] of Object.entries(r.qualitative_responses ?? {})) {
        const f = selfFieldById[key];
        data.push({
          'Employee Name': emp?.full_name ?? '',
          'Employee Code': emp?.employee_code ?? '',
          'Department': dept?.name ?? '',
          'Template Name': tpl.name,
          'Section': 'Qualitative',
          'Field Key': key,
          'Field Label': f?.label ?? key,
          'Max Score': '',
          'Reviewer Stage': stageLabel,
          'Reviewer Name': reviewerName,
          'Score / Response': text ?? '',
          'Submitted At': fmtDate(r.submitted_at),
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(48, h.length + 2)) }));
  if (data.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: headers.length - 1 } }) };
  }
  return ws;
}

/** Builds the two-sheet operational status workbook. Pure — no I/O. */
export function buildOperationalReportWorkbook(input: OperationalReportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildStatusSheet(input), 'Status Overview');
  XLSX.utils.book_append_sheet(wb, buildResponsesSheet(input), 'Form Responses');
  return wb;
}

/** Exposed for the report headers unit test. */
export const STATUS_SHEET_NAME = 'Status Overview';
export const RESPONSES_SHEET_NAME = 'Form Responses';
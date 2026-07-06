import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildOperationalReportWorkbook,
  deriveCurrentStage,
  formatEnabledStages,
  stageSubmittedAtMap,
  STATUS_SHEET_NAME,
  RESPONSES_SHEET_NAME,
} from './operationalReport';
import type {
  AnnualReviewCycle, AnnualReviewInstance, AnnualReviewResponse, AnnualReviewTemplate,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from './annualReviewService';

const cycle: AnnualReviewCycle = {
  id: 'c1', name: 'FY26', review_year: 2026, description: null, status: 'active',
  self_review_start: '2026-04-01', self_review_end: null,
  manager_review_start: null, manager_review_end: null,
  skip_review_start: null, skip_review_end: null,
  dept_review_start: null, dept_review_end: null,
  bu_review_start: null, bu_review_end: null,
  hr_finalization_deadline: null,
  created_by: null, created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
};

const template: AnnualReviewTemplate = {
  id: 't1', name: 'Standard', description: null, is_active: true,
  sections: {
    criteria: [
      { id: 'k1', name: 'Quality', weight: 40, reviewer_stages: ['self', 'manager'],
        options: [{ id: 'o5', label: 'Outstanding', score: 5 }, { id: 'o3', label: 'Meets', score: 3 }] },
      { id: 'k2', name: 'Delivery', weight: 60, reviewer_stages: ['manager'] },
    ],
    self_review_fields: [{ id: 'f1', label: 'Highlights' }],
  },
  created_by: null, created_at: '', updated_at: '',
};

function makeRow(overrides: Partial<AnnualReviewInstance> = {}): InstanceWithEmployee {
  return {
    id: 'i1', employee_id: 'e1', template_id: 't1', cycle_id: 'c1', assigned_rule_id: 'r1',
    overall_status: 'pending_manager', enabled_stages: ['self', 'manager', 'hr'],
    manager_id: 'm1', skip_id: null, dept_head_id: null, bu_head_id: null, hr_id: 'hr1',
    system_scores: {}, eligibility_inputs: {},
    criteria_weighted_score: 72, total_score: 80, final_rating: null, hr_remarks: null,
    language_pref: 'en', finalized_at: null, finalized_by: null,
    created_at: '2026-04-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
    employee: { id: 'e1', full_name: 'Alice', employee_code: 'E001', designation: 'Dev' },
  } as InstanceWithEmployee;
}

const profilesById = {
  e1: { id: 'e1', full_name: 'Alice', employee_code: 'E001', designation: 'Dev', department_id: 'd1', pms_grade: 'M2', level: 'L3' },
  m1: { id: 'm1', full_name: 'Manager One', employee_code: 'M001' },
  hr1: { id: 'hr1', full_name: 'HR One', employee_code: 'H001' },
};
const deptsById = { d1: { id: 'd1', name: 'Ops', business_unit_id: 'b1' } };
const buById = { b1: { id: 'b1', name: 'Plant' } };
const rulesById = { r1: { id: 'r1', name: 'Managers 2026' } };

describe('operationalReport helpers', () => {
  it('deriveCurrentStage maps pending status to reviewer stage', () => {
    expect(deriveCurrentStage({ overall_status: 'pending_manager' } as AnnualReviewInstance)).toBe('manager');
    expect(deriveCurrentStage({ overall_status: 'completed' } as AnnualReviewInstance)).toBeNull();
  });

  it('formatEnabledStages renders arrow-separated chain in canonical order', () => {
    expect(formatEnabledStages(['hr', 'self', 'manager'])).toBe('Self Review → Manager → HR Final');
  });

  it('stageSubmittedAtMap keys by reviewer_role', () => {
    const m = stageSubmittedAtMap([
      { reviewer_role: 'self', submitted_at: '2026-05-01T00:00:00Z' } as AnnualReviewResponse,
      { reviewer_role: 'manager', submitted_at: null } as AnnualReviewResponse,
    ]);
    expect(m.self).toBe('2026-05-01T00:00:00Z');
    expect(m.manager).toBeUndefined();
  });
});

describe('buildOperationalReportWorkbook', () => {
  const responses: AnnualReviewResponse[] = [
    {
      id: 'rsp1', instance_id: 'i1', reviewer_id: 'e1', reviewer_role: 'self',
      criteria_scores: { k1: 4 }, qualitative_responses: { f1: 'Great year' },
      evidence: [], weighted_score: 3.6, submitted_at: '2026-05-01T00:00:00Z',
      is_locked: false, notes: null, created_at: '', updated_at: '',
    },
  ];

  it('builds two sheets with expected names', () => {
    const wb = buildOperationalReportWorkbook({
      cycle, rows: [makeRow()],
      stageScores: { i1: { self: 3.6 } },
      templatesById: { t1: template },
      profilesById, deptsById, buById, rulesById,
      responsesByInstance: { i1: responses },
      now: new Date('2026-06-30T00:00:00Z'),
    });
    expect(wb.SheetNames).toEqual([STATUS_SHEET_NAME, RESPONSES_SHEET_NAME]);
  });

  it('Sheet 1 exposes core status + who-is-stuck-where columns', () => {
    const wb = buildOperationalReportWorkbook({
      cycle, rows: [makeRow()],
      stageScores: { i1: { self: 3.6 } },
      templatesById: { t1: template },
      profilesById, deptsById, buById, rulesById,
      responsesByInstance: { i1: responses },
      now: new Date('2026-06-30T00:00:00Z'),
    });
    const sheet = wb.Sheets[STATUS_SHEET_NAME];
    const [headers, row] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    for (const col of [
      'Employee Name', 'Employee Code', 'Department', 'Business Unit',
      'Reporting Manager', 'HR Owner', 'Assigned Template', 'Assignment Rule',
      'Enabled Stages', 'Overall Status', 'Current Stage', 'Current Stage Owner',
      'Days in Current Stage', 'Self Review Submitted At', 'Self Review Score',
      'BU Head Submitted At', 'Final Rating',
    ]) expect(headers).toContain(col);

    const idx = (h: string) => headers.indexOf(h);
    expect(row[idx('Employee Name')]).toBe('Alice');
    expect(row[idx('Department')]).toBe('Ops');
    expect(row[idx('Business Unit')]).toBe('Plant');
    expect(row[idx('Current Stage')]).toBe('Manager');
    expect(row[idx('Current Stage Owner')]).toBe('Manager One (M001)');
    expect(row[idx('Enabled Stages')]).toBe('Self Review → Manager → HR Final');
    // Days-in-stage: updated 2026-06-01, now 2026-06-30 → 29 days
    expect(row[idx('Days in Current Stage')]).toBe(29);
    // Disabled stages leave blanks (BU Head not in enabled_stages)
    expect(row[idx('BU Head Submitted At')] ?? '').toBe('');
    // Self Review is in chain and has response → submitted_at populated
    expect(row[idx('Self Review Submitted At')]).toBe('2026-05-01');
  });

  it('Sheet 2 emits one row per criterion and per qualitative field', () => {
    const wb = buildOperationalReportWorkbook({
      cycle, rows: [makeRow()],
      stageScores: {}, templatesById: { t1: template },
      profilesById, deptsById, buById, rulesById,
      responsesByInstance: { i1: responses },
      now: new Date('2026-06-30T00:00:00Z'),
    });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[RESPONSES_SHEET_NAME]) as any[];
    expect(data).toHaveLength(2); // 1 criterion + 1 qualitative
    const crit = data.find((r) => r.Section === 'Criteria');
    expect(crit['Field Label']).toBe('Quality');
    expect(crit['Score / Response']).toBe(4);
    expect(crit['Reviewer Stage']).toBe('Self Review');
    const qual = data.find((r) => r.Section === 'Qualitative');
    expect(qual['Field Label']).toBe('Highlights');
    expect(qual['Score / Response']).toBe('Great year');
  });

  it('Sheet 1 includes Dept Head and BU Head overall recommendation columns', () => {
    const recResponses: AnnualReviewResponse[] = [
      {
        id: 'rd', instance_id: 'i1', reviewer_id: 'd1', reviewer_role: 'dept_head',
        criteria_scores: {}, qualitative_responses: { __overall_recommendation: 'Promote' },
        evidence: [], weighted_score: null, submitted_at: '2026-05-10T00:00:00Z',
        is_locked: false, notes: null, created_at: '', updated_at: '',
      },
      {
        id: 'rb', instance_id: 'i1', reviewer_id: 'b1', reviewer_role: 'bu_head',
        criteria_scores: {}, qualitative_responses: { __overall_recommendation: 'Agreed, rotate to Ops' },
        evidence: [], weighted_score: null, submitted_at: '2026-05-12T00:00:00Z',
        is_locked: false, notes: null, created_at: '', updated_at: '',
      },
      {
        id: 'rm', instance_id: 'i1', reviewer_id: 'm1', reviewer_role: 'manager',
        criteria_scores: {}, qualitative_responses: {},
        evidence: [], weighted_score: null, submitted_at: null,
        is_locked: false, notes: null, created_at: '', updated_at: '',
      },
    ];
    const wb = buildOperationalReportWorkbook({
      cycle, rows: [makeRow()],
      stageScores: {}, templatesById: { t1: template },
      profilesById, deptsById, buById, rulesById,
      responsesByInstance: { i1: recResponses },
      now: new Date('2026-06-30T00:00:00Z'),
    });
    const sheet = wb.Sheets[STATUS_SHEET_NAME];
    const [headers, row] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    expect(headers).toContain('Dept Head Recommendation');
    expect(headers).toContain('BU Head Recommendation');
    const idx = (h: string) => headers.indexOf(h);
    expect(row[idx('Dept Head Recommendation')]).toBe('Promote');
    expect(row[idx('BU Head Recommendation')]).toBe('Agreed, rotate to Ops');
  });

  it('is safe with no responses and no template', () => {
    const wb = buildOperationalReportWorkbook({
      cycle, rows: [makeRow({ template_id: 'missing' })],
      stageScores: {}, templatesById: {}, profilesById, deptsById, buById, rulesById,
      responsesByInstance: {},
      now: new Date('2026-06-30T00:00:00Z'),
    });
    // Sheet 2 should still exist with headers only
    const data = XLSX.utils.sheet_to_json(wb.Sheets[RESPONSES_SHEET_NAME]);
    expect(data).toHaveLength(0);
  });
});
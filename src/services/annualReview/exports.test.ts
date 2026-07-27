import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildBlankReviewerWorkbook, buildBulkResultsWorkbook, buildSeedingWorkbook,
  buildReviewerPdfBlob,
} from './exports';
import type { AnnualReviewCycle, AnnualReviewTemplate } from '@/types/annualReview';
import type { InstanceWithEmployee } from './annualReviewService';

const cycle: AnnualReviewCycle = {
  id: 'c1', name: 'FY26', review_year: 2026, description: null, status: 'active',
  self_review_start: null, self_review_end: null,
  manager_review_start: null, manager_review_end: null,
  skip_review_start: null, skip_review_end: null,
  dept_review_start: null, dept_review_end: null,
  bu_review_start: null, bu_review_end: null,
  hr_finalization_deadline: null,
  created_by: null, created_at: '', updated_at: '',
};

const template: AnnualReviewTemplate = {
  id: 't1', name: 'Standard', description: null, is_active: true,
  sections: {
    criteria: [
      { id: 'k1', name: 'Quality', weight: 40, reviewer_stages: ['self', 'manager'],
        options: [{ id: 'o5', label: 'Outstanding', score: 5 }, { id: 'o3', label: 'Meets', score: 3 }] },
      { id: 'k2', name: 'Delivery', weight: 60, reviewer_stages: ['manager'] },
    ],
  },
  created_by: null, created_at: '', updated_at: '',
};

const rows: InstanceWithEmployee[] = [
  {
    id: 'i1', employee_id: 'e1', template_id: 't1', cycle_id: 'c1', assigned_rule_id: null,
    overall_status: 'pending_manager', enabled_stages: ['self', 'manager', 'hr'],
    manager_id: null, skip_id: null, dept_head_id: null, bu_head_id: null, hr_id: null,
    system_scores: { s1: 8 }, eligibility_inputs: { eligible: true },
    criteria_weighted_score: 72, total_score: 80, final_rating: null, hr_remarks: null,
    language_pref: 'en', finalized_at: null, finalized_by: null,
    created_at: '', updated_at: '',
    employee: { id: 'e1', full_name: 'Alice', employee_code: 'E001', designation: 'Engineer' },
  },
];

function sheetHeaders(wb: XLSX.WorkBook, name: string): string[] {
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  return (aoa[0] as string[]) ?? [];
}

describe('annual review exports', () => {
  it('blank reviewer workbook has one column per criterion and per-stage comment columns', () => {
    const wb = buildBlankReviewerWorkbook({ cycle, template, rows });
    const headers = sheetHeaders(wb, 'Criteria');
    expect(headers).toContain('Quality (wt 40%)');
    expect(headers).toContain('Delivery (wt 60%)');
    expect(headers).toContain('Self Comments');
    expect(headers).toContain('HR Comments');
  });

  it('bulk results workbook respects visibleColumns and emits /5 rating headers', () => {
    const wb = buildBulkResultsWorkbook({
      cycle, instances: rows, stageScores: { i1: { self: 4.5, manager: 4 } },
      templatesById: { t1: template },
      visibleColumns: ['employee_code', 'full_name', 'score_self', 'total_score'],
    });
    const headers = sheetHeaders(wb, 'Results');
    expect(headers).toEqual(['Employee Code', 'Full Name', 'Self Rating (/5)', 'Total Score']);
  });

  it('seeding workbook emits one row per (employee × criterion)', () => {
    const wb = buildSeedingWorkbook({ cycle, template, rows });
    const ws = wb.Sheets['Seeding'];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    expect(data.length).toBe(rows.length * (template.sections.criteria?.length ?? 0));
  });

  it('reviewer PDF returns a non-empty blob', async () => {
    const blob = buildReviewerPdfBlob({
      cycle, template,
      employee: { full_name: 'Alice', employee_code: 'E001', designation: 'Engineer' },
      responses: [],
    });
    expect(blob.size).toBeGreaterThan(500);
  });

  it('blank reviewer workbook handles a template with zero criteria', () => {
    const empty = { ...template, sections: { ...template.sections, criteria: [] } };
    const wb = buildBlankReviewerWorkbook({ cycle, template: empty, rows });
    const headers = sheetHeaders(wb, 'Criteria');
    expect(headers).toEqual([
      'Employee Code', 'Full Name', 'Designation',
      'Self Comments', 'Manager Comments', 'Skip Comments', 'Dept Head Comments', 'BU Head Comments', 'HR Comments',
      'Management Comments',
    ]);
  });
});
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildSystemScoresWorkbook,
  buildTemplateAssignmentWorkbook,
  buildWorkflowAssignmentWorkbook,
  buildStageWeightsWorkbook,
} from '@/lib/annualReview/bulkTemplates';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const cycle: any = { id: 'c1', review_year: 2026, name: 'FY26' };
const template: any = {
  id: 't1', name: 'Std', is_active: true,
  sections: {
    system_scores: [{ id: 'sys1', name: 'Attendance' }],
    eligibility_criteria: [{ id: 'e1', name: 'PIP' }],
  },
};
const inst: any = {
  id: 'i1',
  employee: { employee_code: '101785', full_name: 'Ankit C' },
  overall_status: 'pending_self',
  enabled_stages: { self: true, manager: true, skip_manager: false, bu_head: false, hr: false },
  system_scores: {},
  eligibility_inputs: {},
  stage_weights_override: null,
  template_id: 't1',
};

function headers(wb: XLSX.WorkBook, sheet: string): string[] {
  const ws = wb.Sheets[sheet];
  const rng = XLSX.utils.decode_range(ws['!ref']!);
  const out: string[] = [];
  for (let c = rng.s.c; c <= rng.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) out.push(String(cell.v));
  }
  return out;
}

describe('bulkTemplates — download workbook builders', () => {
  it('system scores workbook has Employee Code + dynamic system/eligibility columns', () => {
    const wb = buildSystemScoresWorkbook(template, [inst]);
    expect(headers(wb, 'Annual Review')).toEqual(['Employee Code', 'Full Name', 'Attendance', 'PIP']);
  });

  it('template-assignment workbook exposes the change columns', () => {
    const wb = buildTemplateAssignmentWorkbook([template], [inst]);
    expect(headers(wb, 'Templates')).toEqual([
      'Employee Code', 'Full Name', 'Current Template', 'Stage', 'New Template', 'Reason',
    ]);
  });

  it('workflow-assignment workbook exposes per-stage Y/N columns', () => {
    const wb = buildWorkflowAssignmentWorkbook([inst]);
    expect(headers(wb, 'Workflows')).toEqual([
      'Employee Code', 'Full Name', 'Current Stages',
      'Self (Y/N)', 'Manager (Y/N)', 'Skip (Y/N)', 'BU (Y/N)', 'HR (Y/N)', 'Reason',
    ]);
  });

  it('stage-weights workbook exposes a column per stage-weight key', () => {
    const wb = buildStageWeightsWorkbook([inst], new Map([['t1', template]]));
    const h = headers(wb, 'Stage Weights');
    expect(h.slice(0, 3)).toEqual(['Employee Code', 'Full Name', 'Current Blend']);
    expect(h).toContain('Self %');
    expect(h).toContain('Manager %');
    expect(h).toContain('Criteria %');
    expect(h[h.length - 1]).toBe('Reason');
  });
});
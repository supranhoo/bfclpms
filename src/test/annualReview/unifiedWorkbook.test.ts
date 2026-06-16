import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildUnifiedWorkbook, parseUnifiedWorkbook,
} from '@/lib/annualReview/unifiedWorkbook';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const cycle: any = { id: 'c1', review_year: 2026, name: 'FY26' };
const template: any = {
  id: 't1', name: 'Std', is_active: true,
  sections: {
    system_scores: [{ id: 'sys1', name: 'Attendance' }],
    eligibility_criteria: [{ id: 'e1', name: 'PIP' }],
    stage_weights: { manager: 100 },
  },
};
const altTemplate: any = { id: 't2', name: 'Alt', is_active: true, sections: {} };

function mkInst(overrides: any = {}): any {
  return {
    id: 'i1', employee_id: 'p1',
    employee: { id: 'p1', employee_code: '101785', full_name: 'Ankit C', designation: 'Eng' },
    overall_status: 'pending_self',
    enabled_stages: ['self', 'manager'],
    template_id: 't1', template_override_id: null,
    system_scores: { sys1: 4 },
    eligibility_inputs: { e1: 'no' },
    stage_weights_override: null,
    ...overrides,
  };
}

function wb2file(wb: XLSX.WorkBook): ArrayBuffer {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buf as ArrayBuffer;
}

describe('unifiedWorkbook — builder', () => {
  it('emits main, baseline, and README sheets with required headers', () => {
    const wb = buildUnifiedWorkbook({
      cycle, instances: [mkInst()], templates: [template], systemTemplate: template,
    });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['Annual Review', '__baseline', 'README']));
    const ws = wb.Sheets['Annual Review'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    expect(rows[0]).toMatchObject({
      'Instance ID': 'i1',
      'Employee Code': '101785',
      'Current Template': 'Std',
      'WF Self': 'Y', 'WF Manager': 'Y', 'WF Skip': 'N',
      'SYS Attendance': 4,
      'ELG PIP': 'no',
    });
  });
});

describe('unifiedWorkbook — parser delta semantics', () => {
  it('unchanged workbook yields zero rows', async () => {
    const inst = mkInst();
    const wb = buildUnifiedWorkbook({
      cycle, instances: [inst], templates: [template, altTemplate], systemTemplate: template,
    });
    const res = await parseUnifiedWorkbook(wb2file(wb), [inst], [template, altTemplate], template);
    expect(res.fatal).toEqual([]);
    expect(res.rows).toEqual([]);
  });

  it('detects template change + system score change and requires reason', async () => {
    const inst = mkInst();
    const wb = buildUnifiedWorkbook({
      cycle, instances: [inst], templates: [template, altTemplate], systemTemplate: template,
    });
    // mutate main sheet
    const ws = wb.Sheets['Annual Review'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    rows[0]['New Template'] = 'Alt';
    rows[0]['SYS Attendance'] = 5;
    rows[0]['Reason'] = 'mid-cycle realignment';
    const newWs = XLSX.utils.json_to_sheet(rows, { header: Object.keys(rows[0]) });
    wb.Sheets['Annual Review'] = newWs;

    const res = await parseUnifiedWorkbook(wb2file(wb), [inst], [template, altTemplate], template);
    expect(res.fatal).toEqual([]);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0];
    expect(r.errors).toEqual([]);
    expect(r.edits.map((e) => e.kind).sort()).toEqual(['system_score', 'template']);
    expect(r.reason).toBe('mid-cycle realignment');
  });

  it('rejects template change when instance stage is past pending_self', async () => {
    const inst = mkInst({ overall_status: 'pending_manager' });
    const wb = buildUnifiedWorkbook({
      cycle, instances: [inst], templates: [template, altTemplate], systemTemplate: template,
    });
    const ws = wb.Sheets['Annual Review'];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    rows[0]['New Template'] = 'Alt';
    rows[0]['Reason'] = 'x x x';
    wb.Sheets['Annual Review'] = XLSX.utils.json_to_sheet(rows, { header: Object.keys(rows[0]) });
    const res = await parseUnifiedWorkbook(wb2file(wb), [inst], [template, altTemplate], template);
    expect(res.rows[0].errors[0]).toMatch(/stage is pending_manager/);
  });

  it('rejects upload when __baseline sheet is removed', async () => {
    const inst = mkInst();
    const wb = buildUnifiedWorkbook({
      cycle, instances: [inst], templates: [template], systemTemplate: template,
    });
    delete wb.Sheets['__baseline'];
    wb.SheetNames = wb.SheetNames.filter((s) => s !== '__baseline');
    const res = await parseUnifiedWorkbook(wb2file(wb), [inst], [template], template);
    expect(res.fatal[0]).toMatch(/__baseline/);
    expect(res.rows).toEqual([]);
  });
});
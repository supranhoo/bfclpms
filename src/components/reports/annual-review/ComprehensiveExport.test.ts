import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  employeeSheetHeaders, safeEligibilityHeader, toEmployeeSheet,
} from './ComprehensiveExport';
import type { EligibilityMaps } from '@/services/annualReview/eligibilityReportColumns';
import { DEFAULT_RATING_SLABS } from '@/lib/annualReview/ratingSlab';

const kra = { matrix: new Map(), isKraTemplate: () => false, kraRows: [] } as any;
const labelMaps = { criteria: {}, system: {}, isKra: {} } as any;

function row(over: Record<string, unknown> = {}): any {
  return {
    instance_id: 'i1', employee_id: 'e1', employee_code: '200301', employee_name: 'Test',
    template_id: 't1', overall_status: 'completed', days_pending: 18,
    bu_head_recommendation: 'Please proceed as applicable.',
    ...over,
  };
}

function sheetRows(rows: any[], eligMaps: EligibilityMaps, eligColumns: any[]) {
  const data = toEmployeeSheet(rows, labelMaps, eligMaps, eligColumns, kra, DEFAULT_RATING_SLABS, undefined);
  const header = employeeSheetHeaders(eligColumns.map((c: any) => c.header));
  const ws = XLSX.utils.json_to_sheet(data as any, { header });
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[];
}

describe('ADR-236 — Employees sheet column integrity', () => {
  it('writes BU Head Recommendation under its own header', () => {
    const out = sheetRows([row()], {}, []);
    expect(out[0]['BU Head Recommendation']).toBe('Please proceed as applicable.');
    expect(out[0]['Days Since Update']).toBe(18);
  });

  it('never removes a legitimate numeric recommendation such as 18', () => {
    const out = sheetRows(
      [row({ bu_head_recommendation: '18' }), row({ bu_head_recommendation: '18% hike' })],
      {}, [],
    );
    expect(out[0]['BU Head Recommendation']).toBe('18');
    expect(out[1]['BU Head Recommendation']).toBe('18% hike');
  });

  it('keeps fixed columns intact when a template question collides with a header', () => {
    const criterion: any = {
      id: 'q1', name: 'BU Head Recommendation', type: 'number', operator: 'lte', expected_value: 30,
    };
    const eligMaps: EligibilityMaps = { t1: [criterion] };
    const cols = [{ header: 'BU Head Recommendation', key: 'bu head recommendation' }];
    const out = sheetRows([row({ eligibility_inputs: { q1: 18 } })], eligMaps, cols as any);
    expect(out[0]['BU Head Recommendation']).toBe('Please proceed as applicable.');
    expect(out[0]['Eligibility: BU Head Recommendation']).toContain('18');
  });

  it('exposes every row key in the explicit header list (no dropped columns)', () => {
    const data = toEmployeeSheet([row()], labelMaps, {}, [], kra, DEFAULT_RATING_SLABS, undefined);
    const header = new Set(employeeSheetHeaders([]));
    for (const k of Object.keys(data[0] as object)) expect(header.has(k)).toBe(true);
  });

  it('leaves non-colliding question headers untouched', () => {
    expect(safeEligibilityHeader('Absent Days')).toBe('Absent Days');
  });
});

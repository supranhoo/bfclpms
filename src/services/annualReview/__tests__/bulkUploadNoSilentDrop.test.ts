/**
 * ADR-239 / POLICY §AR-BULK-UPLOAD-NO-SILENT-DROP.
 * A filled cell must never disappear without a named reason.
 */
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';

const writtenSheets: Array<Array<Record<string, unknown>>> = [];
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: () => undefined };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@/services/annualReview/annualReviewService', () => ({
  updateInstance: vi.fn(),
  resolveTemplateId: vi.fn(),
}));

import { parseAndDryRun, downloadBulkTemplate, type CycleBulkPlan } from '../cycleBulkDataUpload';

function makePlan(): CycleBulkPlan {
  return {
    cycleId: 'c1',
    columns: [
      { name: 'Annual Production Target Vs Actual', kind: 'system_scores' },
      { name: 'Absent Days', kind: 'eligibility_inputs' },
    ],
    instances: [
      {
        instanceId: 'i1',
        employeeCode: '101715',
        fullName: 'Jitendra Bharti',
        doj: null,
        departmentName: 'HR',
        businessUnitName: 'HR',
        companyName: 'BFCL',
        hasKra: true,
        templateName: 'Generic M - (With KRA)',
        overallStatus: 'pending_self',
        // No slot for either column — mirrors the carry_kra-only template.
        slotByCanonical: new Map(),
        systemScores: {},
        systemScoresRaw: {},
        eligibilityInputs: {},
      },
    ],
    unresolvedSlots: [],
  };
}

function sheetFile(rows: Array<Record<string, unknown>>): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Annual Review Data');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File([buf], 'test.xlsx');
  // jsdom's File lacks arrayBuffer()
  Object.defineProperty(file, 'arrayBuffer', { value: async () => buf });
  return file;
}

describe('ADR-239 bulk upload transparency', () => {
  it('reports unmapped filled cells instead of dropping them silently', async () => {
    const report = await parseAndDryRun(
      sheetFile([{ 'Employee Code': '101715', 'Annual Production Target Vs Actual': '100%', 'Absent Days': 0 }]),
      makePlan(),
    );
    expect(report.ignoredCellCount).toBe(2);
    expect(report.ignoredByColumn.map((c) => c.column).sort()).toEqual(
      ['Absent Days', 'Annual Production Target Vs Actual'],
    );
    const warnings = report.rows[0].warnings ?? [];
    expect(warnings.join(' ')).toContain("not part of this employee's template");
    expect(warnings.join(' ')).toContain('Generic M - (With KRA)');
  });

  it('treats the "n/a" template marker as untouched', async () => {
    const report = await parseAndDryRun(
      sheetFile([{ 'Employee Code': '101715', 'Annual Production Target Vs Actual': 'n/a', 'Absent Days': 'n/a' }]),
      makePlan(),
    );
    expect(report.ignoredCellCount).toBe(0);
    expect(report.totalChanges).toBe(0);
  });

  it('writes "n/a" into non-applicable cells of the downloaded template', () => {
    const json_to_sheet = vi.spyOn(XLSX.utils, 'json_to_sheet').mockImplementation((rows) => {
      writtenSheets.push(rows as Array<Record<string, unknown>>);
      return {} as never;
    });
    const append = vi.spyOn(XLSX.utils, 'book_append_sheet').mockImplementation(() => undefined);
    downloadBulkTemplate(makePlan(), '2025-2026');
    const row = writtenSheets[0][0];
    expect(row['Absent Days']).toBe('n/a');
    expect(row['Annual Production Target Vs Actual']).toBe('n/a');
    json_to_sheet.mockRestore();
    append.mockRestore();
  });
});

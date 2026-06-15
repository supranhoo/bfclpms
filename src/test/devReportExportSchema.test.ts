import { describe, it, expect } from 'vitest';
import {
  buildDevReportWorkbook,
  DEV_REPORT_DEFAULT_COLUMNS,
} from '@/lib/devReportExport';
import * as XLSX from 'xlsx';

/**
 * POLICY §131: the 4-sheet Development Report workbook MUST preserve the
 * column order published in 101785_PMS_Digitalisation_Self_Evidence.xlsx so
 * prior evidence submissions remain valid.
 */
describe('Development Report XLSX export', () => {
  const wb = buildDevReportWorkbook({
    cover: {
      project_name: 'BFCL PMS',
      tech_stack: 'TS / React',
      repository: 'github.com/example/repo',
      workstreams: ['Org KPI', 'Safety'],
    },
    summary: {
      feature_count: 1,
      bug_count: 1,
      timeline_count: 1,
      min_entry_date: '2026-01-01',
      max_entry_date: '2026-06-01',
    },
    reportingPeriod: '2026-01-01 – 2026-06-01',
    generatedOn: '2026-06-15',
    entries: [
      {
        id: '1', entry_type: 'feature', entry_date: '2026-06-01', period_label: null,
        title: 'F', module_area: 'M', description: 'D', status: 'Shipped',
        severity: null, timeline_type: null, adr_refs: [], linked_commit: null,
        created_by: null, created_at: '', updated_at: '',
      },
      {
        id: '2', entry_type: 'bug', entry_date: null, period_label: '2026 Jun W1',
        title: 'B', module_area: null, description: 'Fix', status: null,
        severity: 'High', timeline_type: null, adr_refs: [], linked_commit: null,
        created_by: null, created_at: '', updated_at: '',
      },
      {
        id: '3', entry_type: 'timeline', entry_date: '2026-06-04', period_label: null,
        title: 'T', module_area: null, description: 'Summary', status: null,
        severity: null, timeline_type: 'Feature', adr_refs: [], linked_commit: null,
        created_by: null, created_at: '', updated_at: '',
      },
    ],
  });

  it('contains the four canonical sheets', () => {
    expect(wb.SheetNames).toEqual(['Cover', 'Features', 'Bugs Fixed', 'Timeline']);
  });

  it('locks the Features header row to the evidence schema', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Features'], { header: 1 });
    expect(rows[2]).toEqual([...DEV_REPORT_DEFAULT_COLUMNS.feature]);
  });

  it('locks the Bugs Fixed header row to the evidence schema', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Bugs Fixed'], { header: 1 });
    expect(rows[2]).toEqual([...DEV_REPORT_DEFAULT_COLUMNS.bug]);
  });

  it('locks the Timeline header row to the evidence schema', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Timeline'], { header: 1 });
    expect(rows[2]).toEqual([...DEV_REPORT_DEFAULT_COLUMNS.timeline]);
  });

  it('uses period_label when entry_date is null', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Bugs Fixed'], { header: 1 });
    expect(rows[3][0]).toBe('2026 Jun W1');
  });
});
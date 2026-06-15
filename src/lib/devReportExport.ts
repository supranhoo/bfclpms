import * as XLSX from 'xlsx';
import type { DevReportEntry, DevReportSummary } from '@/hooks/useDevReportEntries';
import { formatEntryDateCell } from '@/hooks/useDevReportEntries';

export interface DevReportCoverMeta {
  project_name: string;
  tech_stack: string;
  repository: string;
  workstreams: string[];
}

export interface DevReportExportInput {
  cover: DevReportCoverMeta;
  summary: DevReportSummary;
  reportingPeriod: string;
  generatedOn: string; // YYYY-MM-DD
  entries: DevReportEntry[];
  /** Optional column label overrides keyed by canonical default label. */
  labelOverrides?: Record<string, string>;
}

// Default column labels MUST match the uploaded 101785_PMS_Digitalisation_Self_Evidence.xlsx
// schema so prior evidence submissions remain valid. Order is locked.
export const DEV_REPORT_DEFAULT_COLUMNS = {
  feature: ['Date / Period', 'Feature', 'Module / Area', 'What Was Built', 'Status'] as const,
  bug: ['Date / Period', 'Bug / Issue', 'Fix Description', 'Severity'] as const,
  timeline: ['Date / Period', 'Item', 'Summary', 'Type'] as const,
};

function label(key: string, overrides?: Record<string, string>) {
  return overrides?.[key] ?? key;
}

export function buildDevReportWorkbook(input: DevReportExportInput): XLSX.WorkBook {
  const { cover, summary, reportingPeriod, generatedOn, entries, labelOverrides } = input;
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Cover / Summary
  const coverRows: (string | number)[][] = [
    ['BFCL PMS — Project Development Report', ''],
    [
      `Repository: ${cover.repository}  |  Source: dev_report_entries  |  Generated: ${generatedOn}`,
      '',
    ],
    ['', ''],
    ['Project', cover.project_name],
    ['Tech Stack', cover.tech_stack],
    ['Reporting Period Covered', reportingPeriod],
    ['Major Workstreams', cover.workstreams.join(', ')],
    ['New Features Logged (this report)', summary.feature_count],
    ['Bugs / Fixes Logged (this report)', summary.bug_count],
    ['Total Timeline Entries', summary.timeline_count],
  ];
  const coverWs = XLSX.utils.aoa_to_sheet(coverRows);
  coverWs['!cols'] = [{ wch: 38 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, coverWs, 'Cover');

  // Sheet 2 — Features
  const featureHeader = DEV_REPORT_DEFAULT_COLUMNS.feature.map((c) =>
    label(c, labelOverrides),
  );
  const featureRows = entries
    .filter((e) => e.entry_type === 'feature')
    .map((e) => [
      formatEntryDateCell(e),
      e.title,
      e.module_area ?? '',
      e.description,
      e.status ?? '',
    ]);
  const featureWs = XLSX.utils.aoa_to_sheet([
    ['New Features Built — BFCL PMS', '', '', '', ''],
    ['', '', '', '', ''],
    featureHeader,
    ...featureRows,
  ]);
  featureWs['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 24 }, { wch: 110 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, featureWs, 'Features');

  // Sheet 3 — Bugs Fixed
  const bugHeader = DEV_REPORT_DEFAULT_COLUMNS.bug.map((c) => label(c, labelOverrides));
  const bugRows = entries
    .filter((e) => e.entry_type === 'bug')
    .map((e) => [
      formatEntryDateCell(e),
      e.title,
      e.description,
      e.severity ?? '',
    ]);
  const bugWs = XLSX.utils.aoa_to_sheet([
    ['Bugs Fixed — BFCL PMS', '', '', ''],
    ['', '', '', ''],
    bugHeader,
    ...bugRows,
  ]);
  bugWs['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 110 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, bugWs, 'Bugs Fixed');

  // Sheet 4 — Timeline
  const tlHeader = DEV_REPORT_DEFAULT_COLUMNS.timeline.map((c) => label(c, labelOverrides));
  const tlRows = entries
    .filter((e) => e.entry_type === 'timeline')
    .map((e) => [
      formatEntryDateCell(e),
      e.title,
      e.description,
      e.timeline_type ?? '',
    ]);
  const tlWs = XLSX.utils.aoa_to_sheet([
    ['Full Development Timeline — BFCL PMS (chronological)', '', '', ''],
    ['', '', '', ''],
    tlHeader,
    ...tlRows,
  ]);
  tlWs['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 110 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, tlWs, 'Timeline');

  return wb;
}

export function downloadDevReportWorkbook(input: DevReportExportInput, filename: string) {
  const wb = buildDevReportWorkbook(input);
  XLSX.writeFile(wb, filename);
}
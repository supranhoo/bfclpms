/**
 * Pure builders for Annual Review Admin downloads.
 * No DB access — callers fetch data via annualReviewService and pass it in.
 */
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AnnualReviewCycle,
  AnnualReviewTemplate,
  AnnualReviewResponse,
  AnnualReviewerRole,
} from '@/types/annualReview';
import type { InstanceWithEmployee } from './annualReviewService';

const STAGE_ORDER: AnnualReviewerRole[] = ['self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr'];
const STAGE_LABEL: Record<AnnualReviewerRole, string> = {
  self: 'Self', manager: 'Manager', skip_manager: 'Skip', dept_head: 'Dept Head', bu_head: 'BU Head', hr: 'HR',
};

export interface BlankReviewerWorkbookOpts {
  cycle: AnnualReviewCycle;
  template: AnnualReviewTemplate;
  rows: InstanceWithEmployee[];
}

/** Option A — blank reviewer template (Excel). One row per employee, one column per criterion. */
export function buildBlankReviewerWorkbook({ cycle, template, rows }: BlankReviewerWorkbookOpts): XLSX.WorkBook {
  const criteria = template.sections.criteria ?? [];
  const headers = [
    'Employee Code', 'Full Name', 'Designation',
    ...criteria.map((c) => `${c.name} (wt ${c.weight}%)`),
    ...STAGE_ORDER.map((s) => `${STAGE_LABEL[s]} Comments`),
  ];
  const data = rows.map((r) => {
    const base: Record<string, unknown> = {
      'Employee Code': r.employee?.employee_code ?? '',
      'Full Name': r.employee?.full_name ?? '',
      'Designation': r.employee?.designation ?? '',
    };
    for (const c of criteria) base[`${c.name} (wt ${c.weight}%)`] = '';
    for (const s of STAGE_ORDER) base[`${STAGE_LABEL[s]} Comments`] = '';
    return base;
  });

  const instructions = [
    ['Annual Review — Blank Reviewer Template'],
    [`Cycle: ${cycle.name} (${cycle.review_year})`],
    [`Template: ${template.name}`],
    [],
    ['1. Fill the score column for each criterion using the rating scale defined in the template.'],
    ['2. Use the Comments columns to capture qualitative remarks for each stage.'],
    ['3. This workbook is for offline drafting — final scores must be entered in the app.'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instructions');
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(40, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Criteria');
  return wb;
}

export interface BulkResultsWorkbookOpts {
  cycle: AnnualReviewCycle;
  instances: InstanceWithEmployee[];
  /** instance_id → reviewer_role → weighted_score */
  stageScores: Record<string, Partial<Record<AnnualReviewerRole, number | null>>>;
  templatesById: Record<string, AnnualReviewTemplate>;
  visibleColumns: string[];
}

/** Option C — bulk results export (Excel). All instances expanded with per-stage scores. */
export function buildBulkResultsWorkbook(opts: BulkResultsWorkbookOpts): XLSX.WorkBook {
  const { cycle, instances, stageScores, visibleColumns } = opts;
  const colSet = new Set(visibleColumns);

  const headers: string[] = [];
  const push = (key: string, label: string) => { if (colSet.has(key)) headers.push(label); };
  push('employee_code', 'Employee Code');
  push('full_name', 'Full Name');
  push('designation', 'Designation');
  push('department', 'Department');
  push('business_unit', 'Business Unit');
  push('manager', 'Manager');
  push('overall_status', 'Stage');
  push('enabled_stages', 'Enabled Stages');
  push('score_self', 'Self Score');
  push('score_manager', 'Manager Score');
  push('score_skip', 'Skip Score');
  push('score_bu', 'BU Score');
  push('score_hr', 'HR Score');
  push('criteria_weighted_score', 'Criteria Weighted Score');
  push('total_score', 'Total Score');
  push('final_rating', 'Final Rating');
  push('system_scores', 'System Scores (JSON)');
  push('eligibility_inputs', 'Eligibility Inputs (JSON)');
  push('has_override', 'Custom Weights');
  push('finalized_at', 'Finalized At');
  push('acknowledged_at', 'Acknowledged At');

  const data = instances.map((inst) => {
    const scores = stageScores[inst.id] ?? {};
    const row: Record<string, unknown> = {};
    if (colSet.has('employee_code')) row['Employee Code'] = inst.employee?.employee_code ?? '';
    if (colSet.has('full_name')) row['Full Name'] = inst.employee?.full_name ?? '';
    if (colSet.has('designation')) row['Designation'] = inst.employee?.designation ?? '';
    if (colSet.has('department')) row['Department'] = '';
    if (colSet.has('business_unit')) row['Business Unit'] = '';
    if (colSet.has('manager')) row['Manager'] = '';
    if (colSet.has('overall_status')) row['Stage'] = inst.overall_status;
    if (colSet.has('enabled_stages')) row['Enabled Stages'] = (inst.enabled_stages ?? []).join(', ');
    if (colSet.has('score_self')) row['Self Score'] = scores.self ?? '';
    if (colSet.has('score_manager')) row['Manager Score'] = scores.manager ?? '';
    if (colSet.has('score_skip')) row['Skip Score'] = scores.skip_manager ?? '';
    if (colSet.has('score_bu')) row['BU Score'] = scores.bu_head ?? '';
    if (colSet.has('score_hr')) row['HR Score'] = scores.hr ?? '';
    if (colSet.has('criteria_weighted_score')) row['Criteria Weighted Score'] = inst.criteria_weighted_score ?? '';
    if (colSet.has('total_score')) row['Total Score'] = inst.total_score ?? '';
    if (colSet.has('final_rating')) row['Final Rating'] = inst.final_rating ?? '';
    if (colSet.has('system_scores')) row['System Scores (JSON)'] = JSON.stringify(inst.system_scores ?? {});
    if (colSet.has('eligibility_inputs')) row['Eligibility Inputs (JSON)'] = JSON.stringify(inst.eligibility_inputs ?? {});
    if (colSet.has('has_override')) row['Custom Weights'] = inst.stage_weights_override ? 'yes' : 'no';
    if (colSet.has('finalized_at')) row['Finalized At'] = inst.finalized_at ?? '';
    if (colSet.has('acknowledged_at')) row['Acknowledged At'] = inst.acknowledged_at ?? '';
    return row;
  });

  const meta = [
    ['Cycle', cycle.name],
    ['Year', cycle.review_year],
    ['Exported At', new Date().toISOString()],
    ['Rows', instances.length],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Filters');
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(50, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  return wb;
}

/** Option D — cycle seeding template (Excel). Employees × criteria with Score + Comment per stage. */
export function buildSeedingWorkbook({ cycle, template, rows }: BlankReviewerWorkbookOpts): XLSX.WorkBook {
  const criteria = template.sections.criteria ?? [];
  const stageCols: string[] = [];
  for (const s of STAGE_ORDER) {
    stageCols.push(`${STAGE_LABEL[s]} Score`);
    stageCols.push(`${STAGE_LABEL[s]} Comment`);
  }
  const headers = [
    'Employee Code', 'Full Name', 'Criterion', 'Weight %', 'Rating Scale',
    ...stageCols,
  ];

  const data: Record<string, unknown>[] = [];
  for (const r of rows) {
    for (const c of criteria) {
      const scale = (c.options ?? []).map((o) => `${o.score}=${o.label}`).join(' | ');
      const row: Record<string, unknown> = {
        'Employee Code': r.employee?.employee_code ?? '',
        'Full Name': r.employee?.full_name ?? '',
        'Criterion': c.name,
        'Weight %': c.weight,
        'Rating Scale': scale,
      };
      for (const sc of stageCols) row[sc] = '';
      data.push(row);
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Annual Review — Cycle Seeding Template'],
    [`Cycle: ${cycle.name} (${cycle.review_year})`],
    [`Template: ${template.name}`],
    [],
    ['One row per (employee × criterion). Fill Score and Comment columns offline.'],
    ['Re-import is not supported in v1 — use this workbook for drafting only.'],
  ]), 'Instructions');
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(40, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Seeding');
  return wb;
}

export interface ReviewerPdfOpts {
  cycle: AnnualReviewCycle;
  template: AnnualReviewTemplate;
  employee: { full_name?: string | null; employee_code?: string | null; designation?: string | null };
  responses?: AnnualReviewResponse[];
  companyName?: string;
  showLogo?: boolean;
  showEmployeeDetails?: boolean;
}

/** Option B — per-employee printable PDF. Uses jspdf + autotable, no images. */
export function buildReviewerPdfBlob(opts: ReviewerPdfOpts): Blob {
  const { cycle, template, employee, responses = [], companyName, showEmployeeDetails = true } = opts;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 12;

  if (companyName) {
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(companyName, W / 2, y, { align: 'center' });
    y += 6;
  }
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`Annual Review — ${cycle.name} (${cycle.review_year})`, W / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Template: ${template.name}`, W / 2, y, { align: 'center' });
  y += 6;

  if (showEmployeeDetails) {
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.5 },
      body: [
        ['Employee', employee.full_name ?? '-', 'Code', employee.employee_code ?? '-'],
        ['Designation', employee.designation ?? '-', 'Generated', new Date().toLocaleDateString()],
      ],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 2: { fontStyle: 'bold', cellWidth: 22 } },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  const criteria = template.sections.criteria ?? [];
  const scoreByRole: Record<AnnualReviewerRole, Record<string, number>> = {
    self: {}, manager: {}, skip_manager: {}, dept_head: {}, bu_head: {}, hr: {},
  };
  for (const r of responses) {
    scoreByRole[r.reviewer_role] = r.criteria_scores ?? {};
  }

  const body = criteria.map((c, i) => [
    String(i + 1),
    c.name,
    `${c.weight}%`,
    scoreByRole.self[c.id] ?? '',
    scoreByRole.manager[c.id] ?? '',
    scoreByRole.skip_manager[c.id] ?? '',
    scoreByRole.dept_head[c.id] ?? '',
    scoreByRole.bu_head[c.id] ?? '',
    scoreByRole.hr[c.id] ?? '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Criterion', 'Wt', 'Self', 'Mgr', 'Skip', 'Dept', 'BU', 'HR']],
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8 }, 1: { cellWidth: 70 }, 2: { cellWidth: 12 },
      3: { cellWidth: 14 }, 4: { cellWidth: 14 }, 5: { cellWidth: 14 },
      6: { cellWidth: 14 }, 7: { cellWidth: 14 }, 8: { cellWidth: 14 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // Rating scale legend (uses first criterion's options as the canonical scale)
  const scale = (criteria[0]?.options ?? []).slice().sort((a, b) => b.score - a.score);
  if (scale.length) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Rating scale', 12, y); y += 4;
    autoTable(doc, {
      startY: y, theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1 },
      body: scale.map((o) => [String(o.score), o.label]),
      columnStyles: { 0: { cellWidth: 12, fontStyle: 'bold' } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Signature block
  autoTable(doc, {
    startY: y, theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4, minCellHeight: 18, valign: 'bottom' },
    head: [['Self', 'Manager', 'Skip', 'Dept Head', 'BU Head', 'HR']],
    body: [['', '', '', '', '', '']],
  });

  return doc.output('blob');
}
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ============= Column Registry =============

export interface ColumnDef {
  header: string;
  width: number;
  getValue: (kpi: KraKpiRow, index: number) => string;
}

export interface KraKpiRow {
  category: string;
  categoryColor?: string;
  kra_name: string;
  kpi_name: string;
  uom: string | null;
  target: number | string | null;
  weightage: number | null;
  criteria: string | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  frequency: string | null;
  source_of_data: string | null;
}

export interface KraSheetData {
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  period: string;
  year: number;
  kpis: KraKpiRow[];
  companyName?: string;
  logoUrl?: string | null;
}

export interface KraExportConfig {
  visibleColumns: string[];
  showLogo: boolean;
  showEmployeeDetails: boolean;
}

const fmt = (v: unknown) => (v != null && v !== '' ? String(v) : '-');

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  sr:        { header: 'Sr.',       width: 8,   getValue: (_, i) => String(i + 1) },
  category:  { header: 'Category',  width: 22,  getValue: (k) => fmt(k.category) },
  kra:       { header: 'KRA',       width: 30,  getValue: (k) => fmt(k.kra_name) },
  kpi:       { header: 'KPI',       width: 30,  getValue: (k) => fmt(k.kpi_name) },
  uom:       { header: 'UOM',       width: 15,  getValue: (k) => fmt(k.uom) },
  target:    { header: 'Target',    width: 18,  getValue: (k) => fmt(k.target) },
  weightage: { header: 'Wt%',       width: 10,  getValue: (k) => k.weightage != null ? `${k.weightage}%` : '-' },
  criteria:  { header: 'Criteria',  width: 20,  getValue: (k) => fmt(k.criteria) },
  r5:        { header: 'R5 (Blue)', width: 18,  getValue: (k) => fmt(k.r5) },
  r4:        { header: 'R4 (Green)', width: 18, getValue: (k) => fmt(k.r4) },
  r3:        { header: 'R3 (Yellow)', width: 18, getValue: (k) => fmt(k.r3) },
  r2:        { header: 'R2 (Orange)', width: 18, getValue: (k) => fmt(k.r2) },
  r1:        { header: 'R1 (Red)',  width: 18,  getValue: (k) => fmt(k.r1) },
  r0:        { header: 'R0 (NA)',   width: 18,  getValue: (k) => fmt(k.r0) },
  frequency: { header: 'Frequency', width: 15,  getValue: (k) => fmt(k.frequency) },
  source:    { header: 'Source',    width: 20,  getValue: (k) => fmt(k.source_of_data) },
};

// All known column keys in display order
export const ALL_COLUMN_KEYS = Object.keys(COLUMN_REGISTRY);

// ============= PDF Builder =============

function buildKraSheetDoc(data: KraSheetData, config: KraExportConfig): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ---- Header ----
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('KRA Assignment Sheet', margin, y + 8);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  const periodText = `Period: ${data.period} ${data.year}`;
  doc.text(periodText, pageWidth - margin - doc.getTextWidth(periodText), y + 8);

  if (data.companyName) {
    doc.setFontSize(9);
    doc.text(data.companyName, margin, y + 14);
  }

  y += 20;

  // ---- Employee Profile ----
  if (config.showEmployeeDetails) {
    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

    const fields = [
      { label: 'Employee', value: data.employeeName },
      { label: 'Code', value: data.employeeCode || '-' },
      { label: 'Designation', value: data.designation || '-' },
      { label: 'Department', value: data.department || '-' },
    ];

    const colW = contentWidth / fields.length;
    fields.forEach((f, i) => {
      const x = margin + 4 + i * colW;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text(f.label, x, y + 7);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const truncated = f.value.length > 25 ? f.value.substring(0, 22) + '...' : f.value;
      doc.text(truncated, x, y + 14);
    });

    y += 26;
  }

  // ---- Build dynamic columns ----
  const cols = config.visibleColumns
    .map(key => ({ key, def: COLUMN_REGISTRY[key] }))
    .filter(c => c.def != null);

  if (cols.length === 0) return doc;

  const totalDefinedWidth = cols.reduce((sum, c) => sum + c.def.width, 0);
  const scale = contentWidth / totalDefinedWidth;

  const headers = cols.map(c => c.def.header);
  const colWidths = cols.map(c => c.def.width * scale);

  const body = data.kpis.map((kpi, idx) =>
    cols.map(c => c.def.getValue(kpi, idx))
  );

  // ---- Table ----
  autoTable(doc, {
    startY: y,
    head: [headers],
    body,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: Object.fromEntries(
      colWidths.map((w, i) => [i, { cellWidth: w }])
    ),
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didDrawPage: (hookData) => {
      // Footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Generated on ${new Date().toLocaleDateString()} — Page ${hookData.pageNumber} of ${pageCount}`,
        margin,
        doc.internal.pageSize.getHeight() - 5
      );
    },
  });

  // ---- Summary ----
  const finalY = (doc as any).lastAutoTable?.finalY || y + 20;
  const totalWeight = data.kpis.reduce((s, k) => s + (k.weightage || 0), 0);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Total KPIs: ${data.kpis.length}`, margin, finalY + 8);
  doc.text(`Total Weightage: ${totalWeight}%`, margin + 50, finalY + 8);

  return doc;
}

// ============= Public API =============

export function generateKraSheetPdf(data: KraSheetData, config: KraExportConfig): void {
  const doc = buildKraSheetDoc(data, config);
  const fileName = `KRA_${data.employeeName.replace(/\s+/g, '_')}_${data.period}_${data.year}.pdf`;
  doc.save(fileName);
}

export function generateKraSheetPdfBlob(data: KraSheetData, config: KraExportConfig): Blob {
  const doc = buildKraSheetDoc(data, config);
  return doc.output('blob');
}

// ============= Excel Builder =============

export function generateKraSheetExcel(data: KraSheetData, config: KraExportConfig): void {
  const cols = config.visibleColumns
    .map(key => ({ key, def: COLUMN_REGISTRY[key] }))
    .filter(c => c.def != null);

  if (cols.length === 0) return;

  const rows: (string | number)[][] = [];

  // Employee details header rows
  if (config.showEmployeeDetails) {
    if (data.companyName) rows.push([data.companyName]);
    rows.push(['KRA Assignment Sheet']);
    rows.push([]);
    rows.push(['Employee', data.employeeName, '', 'Code', data.employeeCode || '-']);
    rows.push(['Designation', data.designation || '-', '', 'Department', data.department || '-']);
    rows.push(['Period', `${data.period} ${data.year}`]);
    rows.push([]);
  }

  // Column headers
  rows.push(cols.map(c => c.def.header));

  // Data rows
  data.kpis.forEach((kpi, idx) => {
    rows.push(cols.map(c => c.def.getValue(kpi, idx)));
  });

  // Summary row
  rows.push([]);
  const totalWeight = data.kpis.reduce((s, k) => s + (k.weightage || 0), 0);
  rows.push([`Total KPIs: ${data.kpis.length}`, `Total Weightage: ${totalWeight}%`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = cols.map(c => ({ wch: Math.max(c.def.width, 10) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KRA Sheet');

  const fileName = `KRA_${data.employeeName.replace(/\s+/g, '_')}_${data.period}_${data.year}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Maps raw KPI array + profile into KraSheetData.
 * This keeps the PDF engine decoupled from Supabase types.
 */
export function buildKraSheetFromKpis(
  kpis: any[],
  profile: { full_name?: string | null; employee_code?: string | null; designation?: string | null },
  department: string,
  period: string,
  year: number,
  companyName?: string,
): KraSheetData {
  return {
    employeeName: profile.full_name || 'Employee',
    employeeCode: profile.employee_code || '-',
    designation: profile.designation || '-',
    department,
    period,
    year,
    companyName,
    kpis: kpis.map(k => ({
      category: k.kra_categories?.name || '-',
      categoryColor: k.kra_categories?.color || undefined,
      kra_name: k.kra_name,
      kpi_name: k.kpi_name,
      uom: k.uom,
      target: k.target_value,
      weightage: k.weightage,
      criteria: k.criteria,
      r5: k.r5,
      r4: k.r4,
      r3: k.r3,
      r2: k.r2,
      r1: k.r1,
      r0: k.r0,
      frequency: k.frequency,
      source_of_data: k.source_of_data,
    })),
  };
}

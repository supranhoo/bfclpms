import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  totalKpis: number;
  completedKpis: number;
  approvedKpis: number;
  avgSelfScore: number;
  avgManagerScore: number;
  avgAuditorScore: number;
  avgManagementScore: number;
  avgFinalScore: number;
  kpiDetails: {
    kpiName: string;
    kraName: string;
    category: string;
    weightage: number;
    target: number | null;
    selfScore: number | null;
    selfRating: string | null;
    managerScore: number | null;
    managerRating: string | null;
    auditorScore: number | null;
    auditorRating: string | null;
    managementScore: number | null;
    managementRating: string | null;
    finalScore: number | null;
    finalRating: string | null;
    status: string;
  }[];
}

interface PdfExportOptions {
  period: string;
  year: string;
  companyName?: string;
}

const getRatingColor = (rating: string | null): [number, number, number] => {
  switch (rating) {
    case 'blue': return [59, 130, 246]; // Blue
    case 'green': return [34, 197, 94]; // Green
    case 'yellow': return [234, 179, 8]; // Yellow
    case 'red': return [239, 68, 68]; // Red
    default: return [156, 163, 175]; // Gray
  }
};

const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return '-';
  return score.toFixed(2);
};

export const generateScorecardPdf = (
  scorecard: EmployeeScorecard,
  options: PdfExportOptions
): void => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(options.companyName || 'Performance Management System', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Employee Performance Scorecard', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 7;
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`${options.period} ${options.year}`, pageWidth / 2, yPos, { align: 'center' });
  doc.setTextColor(0);

  // Employee Info Box
  yPos += 12;
  doc.setDrawColor(200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 28, 3, 3, 'FD');

  yPos += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(scorecard.employeeName, margin + 5, yPos);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${scorecard.employeeCode}  •  ${scorecard.designation}`, margin + 5, yPos + 6);
  doc.text(`Department: ${scorecard.department}`, margin + 5, yPos + 12);
  doc.setTextColor(0);

  // Summary Stats
  const statsY = yPos + 4;
  const statsX = pageWidth - margin - 60;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Final Score', statsX, statsY);
  doc.setTextColor(0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(formatScore(scorecard.avgFinalScore), statsX, statsY + 10);
  
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text(`KPIs: ${scorecard.approvedKpis}/${scorecard.totalKpis}`, statsX + 30, statsY);
  doc.setTextColor(0);

  // Score Summary Table
  yPos += 35;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Score Summary', margin, yPos);
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    head: [['Stage', 'Average Score']],
    body: [
      ['Self Review', formatScore(scorecard.avgSelfScore)],
      ['Manager Review', formatScore(scorecard.avgManagerScore)],
      ['Auditor Review', formatScore(scorecard.avgAuditorScore)],
      ['Management Review', formatScore(scorecard.avgManagementScore)],
      ['Final Score', formatScore(scorecard.avgFinalScore)],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 40, halign: 'center' },
    },
    margin: { left: margin, right: margin },
    tableWidth: 100,
  });

  // KPI Details Table
  yPos = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('KPI Performance Details', margin, yPos);
  yPos += 5;

  const kpiTableData = scorecard.kpiDetails.map(kpi => [
    kpi.category,
    kpi.kraName.length > 25 ? kpi.kraName.substring(0, 22) + '...' : kpi.kraName,
    kpi.kpiName.length > 30 ? kpi.kpiName.substring(0, 27) + '...' : kpi.kpiName,
    `${kpi.weightage}%`,
    formatScore(kpi.selfScore),
    formatScore(kpi.managerScore),
    formatScore(kpi.finalScore),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'KRA', 'KPI', 'Wt.', 'Self', 'Mgr', 'Final']],
    body: kpiTableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 35 },
      2: { cellWidth: 45 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 18, halign: 'center' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  •  Generated on ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} of ${pageCount}  •  Generated on ${new Date().toLocaleDateString()}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  // Save
  doc.save(`Scorecard_${scorecard.employeeCode}_${options.period}_${options.year}.pdf`);
};

export const generateBulkScorecardPdf = (
  scorecards: EmployeeScorecard[],
  options: PdfExportOptions
): void => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let yPos = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(options.companyName || 'Performance Management System', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Monthly Scorecard Report - ${options.period} ${options.year}`, pageWidth / 2, yPos, { align: 'center' });

  // Summary Stats
  yPos += 12;
  const totalEmployees = scorecards.length;
  const totalKpis = scorecards.reduce((sum, sc) => sum + sc.totalKpis, 0);
  const avgFinal = totalEmployees > 0 
    ? scorecards.reduce((sum, sc) => sum + sc.avgFinalScore, 0) / totalEmployees 
    : 0;

  doc.setFontSize(10);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 12, 2, 2, 'F');
  
  yPos += 8;
  doc.text(`Total Employees: ${totalEmployees}`, margin + 10, yPos);
  doc.text(`Total KPIs: ${totalKpis}`, margin + 70, yPos);
  doc.text(`Average Final Score: ${avgFinal.toFixed(2)}`, margin + 130, yPos);

  // Main Table
  yPos += 10;
  const tableData = scorecards.map(sc => [
    sc.employeeCode,
    sc.employeeName,
    sc.designation,
    sc.department,
    `${sc.approvedKpis}/${sc.totalKpis}`,
    formatScore(sc.avgSelfScore),
    formatScore(sc.avgManagerScore),
    formatScore(sc.avgAuditorScore),
    formatScore(sc.avgManagementScore),
    formatScore(sc.avgFinalScore),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Code', 'Employee Name', 'Designation', 'Department', 'KPIs', 'Self', 'Manager', 'Auditor', 'Mgmt', 'Final']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
      8: { cellWidth: 20, halign: 'center' },
      9: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  •  Generated on ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 7,
        { align: 'center' }
      );
    },
  });

  // Save
  doc.save(`Scorecard_Report_${options.period}_${options.year}.pdf`);
};

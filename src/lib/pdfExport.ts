import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RatingLevel, ratingToLevel } from './ratingCalculation';

// ============= Types =============

export interface EmployeeScorecard {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  division?: string;
  totalKpis: number;
  completedKpis: number;
  approvedKpis: number;
  avgSelfScore: number;
  avgManagerScore: number;
  avgAuditorScore: number;
  avgManagementScore: number;
  avgFinalScore: number;
  kpiDetails: KpiDetail[];
  categoryMetrics?: CategoryMetric[];
}

export interface KpiDetail {
  kpiName: string;
  kraName: string;
  category: string;
  weightage: number;
  target: number | string | null;
  uom?: string;
  criteria?: string;
  
  // Self Review
  selfAchieved?: string | number | null;
  selfScore: number | null;
  selfRating: string | null;
  selfRemarks?: string | null;
  selfEvidence?: string | null;
  
  // Manager Review
  managerAchieved?: string | number | null;
  managerScore: number | null;
  managerRating: string | null;
  managerRemarks?: string | null;
  managerEvidence?: string | null;
  
  // Auditor Review
  auditorAchieved?: string | number | null;
  auditorScore: number | null;
  auditorRating: string | null;
  auditorRemarks?: string | null;
  auditorEvidence?: string | null;
  
  // Management Review
  managementAchieved?: string | number | null;
  managementScore: number | null;
  managementRating: string | null;
  managementRemarks?: string | null;
  
  // Final
  finalScore: number | null;
  finalRating: string | null;
  status: string;
}

export interface CategoryMetric {
  name: string;
  percentage: number;
  weightage?: number;
  score?: number;
}

export interface PdfExportOptions {
  period: string;
  year: string;
  companyName?: string;
}

// ============= Color Utilities =============

const COLORS = {
  primary: [59, 130, 246] as [number, number, number],      // Blue-500
  primaryDark: [37, 99, 235] as [number, number, number],   // Blue-600
  success: [34, 197, 94] as [number, number, number],       // Green-500
  warning: [234, 179, 8] as [number, number, number],       // Yellow-500
  danger: [239, 68, 68] as [number, number, number],        // Red-500
  gray: [156, 163, 175] as [number, number, number],        // Gray-400
  grayLight: [243, 244, 246] as [number, number, number],   // Gray-100
  grayMedium: [107, 114, 128] as [number, number, number],  // Gray-500
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

const getRatingColor = (rating: string | number | null): [number, number, number] => {
  if (rating === null || rating === undefined) return COLORS.gray;
  
  // Handle numeric ratings
  if (typeof rating === 'number') {
    if (rating >= 4) return COLORS.primary;
    if (rating >= 3) return COLORS.success;
    if (rating >= 2) return COLORS.warning;
    return COLORS.danger;
  }
  
  // Handle string ratings (blue, green, yellow, red)
  switch (rating.toLowerCase()) {
    case 'blue': return COLORS.primary;
    case 'green': return COLORS.success;
    case 'yellow': return COLORS.warning;
    case 'red': return COLORS.danger;
    default: return COLORS.gray;
  }
};

const getScoreColor = (score: number | null): [number, number, number] => {
  if (score === null) return COLORS.gray;
  if (score >= 4) return COLORS.primary;
  if (score >= 3) return COLORS.success;
  if (score >= 2) return COLORS.warning;
  return COLORS.danger;
};

// ============= Formatters =============

const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return '-';
  return score.toFixed(2);
};

const formatPercentage = (value: number): string => {
  return `${Math.round(value * 100) / 100}%`;
};

const truncateText = (text: string | null | undefined, maxLength: number): string => {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

const getRatingText = (rating: string | number | null): string => {
  if (rating === null || rating === undefined) return '-';
  if (typeof rating === 'number') {
    const level = ratingToLevel(rating);
    return level.charAt(0).toUpperCase() + level.slice(1);
  }
  return rating.charAt(0).toUpperCase() + rating.slice(1);
};

// ============= Drawing Helpers =============

function drawProgressBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  percentage: number,
  fillColor: [number, number, number] = COLORS.primary,
  bgColor: [number, number, number] = COLORS.grayLight
): void {
  // Background
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, 'F');
  
  // Fill
  const fillWidth = Math.min(Math.max(percentage / 100, 0), 1) * width;
  if (fillWidth > 0) {
    doc.setFillColor(...fillColor);
    doc.roundedRect(x, y, fillWidth, height, height / 2, height / 2, 'F');
  }
}

function drawCategoryChart(
  doc: jsPDF,
  categories: CategoryMetric[],
  x: number,
  y: number,
  width: number,
  barHeight: number = 8,
  gap: number = 12
): number {
  let currentY = y;
  const labelWidth = 65;
  const barWidth = width - labelWidth - 35;
  const barX = x + labelWidth;
  
  categories.forEach((cat) => {
    // Category name
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    doc.text(truncateText(cat.name, 22), x, currentY + barHeight / 2 + 1);
    
    // Progress bar
    const percentage = Math.min(cat.percentage, 100);
    const color = getScoreColor(cat.percentage / 20); // Convert to 5-point scale
    drawProgressBar(doc, barX, currentY - 2, barWidth, barHeight, percentage, color);
    
    // Percentage label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${Math.round(percentage)}%`, barX + barWidth + 3, currentY + barHeight / 2);
    
    currentY += gap;
  });
  
  return currentY;
}

function drawProfileBox(
  doc: jsPDF,
  scorecard: EmployeeScorecard,
  x: number,
  y: number,
  width: number
): number {
  const boxHeight = 32;
  const colWidth = width / 4;
  
  // Box background
  doc.setFillColor(...COLORS.grayLight);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(x, y, width, boxHeight, 3, 3, 'FD');
  
  // Section title
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('EMPLOYEE PROFILE', x + 5, y + 8);
  
  // Profile fields
  const fields = [
    { label: 'Full Name', value: scorecard.employeeName },
    { label: 'Designation', value: scorecard.designation || '-' },
    { label: 'Department', value: scorecard.department || '-' },
    { label: 'Employee Code', value: scorecard.employeeCode || '-' },
  ];
  
  fields.forEach((field, index) => {
    const fieldX = x + 5 + (index * colWidth);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(field.label, fieldX, y + 17);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text(truncateText(field.value, 20), fieldX, y + 25);
  });
  
  return y + boxHeight + 8;
}

function drawScoreSummaryBox(
  doc: jsPDF,
  scorecard: EmployeeScorecard,
  x: number,
  y: number,
  width: number
): number {
  const boxHeight = 45;
  const scoreBoxWidth = 60;
  const ratingBoxWidth = 50;
  const statusBoxWidth = 55;
  
  // Total Score Section
  doc.setFillColor(...COLORS.grayLight);
  doc.roundedRect(x, y, width - ratingBoxWidth - statusBoxWidth - 10, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('TOTAL SCORE', x + 8, y + 12);
  
  // Calculate total points
  const maxScore = scorecard.totalKpis * 5;
  const earnedScore = scorecard.avgFinalScore * scorecard.totalKpis;
  const percentage = maxScore > 0 ? (earnedScore / maxScore) * 100 : 0;
  
  // Progress bar
  const barWidth = width - ratingBoxWidth - statusBoxWidth - 80;
  const color = getScoreColor(scorecard.avgFinalScore);
  drawProgressBar(doc, x + 8, y + 20, barWidth, 10, percentage, color);
  
  // Score text
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text(`${formatPercentage(percentage)}`, x + barWidth + 15, y + 27);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${earnedScore.toFixed(1)} / ${maxScore.toFixed(1)} pts`, x + 8, y + 40);
  
  // Overall Rating Box
  const ratingX = x + width - ratingBoxWidth - statusBoxWidth - 5;
  doc.setFillColor(...getScoreColor(scorecard.avgFinalScore));
  doc.roundedRect(ratingX, y, ratingBoxWidth, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('OVERALL RATING', ratingX + 5, y + 12);
  
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formatScore(scorecard.avgFinalScore)}`, ratingX + 10, y + 30);
  
  doc.setFontSize(8);
  doc.text('/ 5', ratingX + 35, y + 30);
  
  // Review Status Box
  const statusX = x + width - statusBoxWidth;
  doc.setFillColor(240, 240, 240);
  doc.roundedRect(statusX, y, statusBoxWidth, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('KPI STATUS', statusX + 5, y + 12);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.success);
  doc.text(`${scorecard.approvedKpis}`, statusX + 10, y + 28);
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.grayMedium);
  doc.setFont('helvetica', 'normal');
  doc.text(`/ ${scorecard.totalKpis} KPIs`, statusX + 22, y + 28);
  doc.text('Completed', statusX + 10, y + 38);
  
  return y + boxHeight + 10;
}

// ============= Main Export Functions =============

export function generateDetailedScorecardPdf(
  scorecard: EmployeeScorecard,
  options: PdfExportOptions
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let yPos = 15;

  // ===== PAGE 1: Dashboard Summary =====
  
  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('Performance Management Dashboard', margin, yPos);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${options.companyName || 'Organization'} • ${options.period} ${options.year}`, margin, yPos + 7);
  
  yPos += 18;
  
  // Employee Profile Box
  yPos = drawProfileBox(doc, scorecard, margin, yPos, pageWidth - 2 * margin);
  
  // Score Summary Box
  yPos = drawScoreSummaryBox(doc, scorecard, margin, yPos, pageWidth - 2 * margin);
  
  // Performance by Category Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text('PERFORMANCE BY CATEGORY', margin, yPos + 5);
  yPos += 12;
  
  // Build category metrics if not provided
  if (scorecard.categoryMetrics && scorecard.categoryMetrics.length > 0) {
    yPos = drawCategoryChart(doc, scorecard.categoryMetrics, margin, yPos, pageWidth - 2 * margin);
  } else {
    // Generate from KPI details
    const categoryMap = new Map<string, { totalScore: number; totalWeight: number }>();
    scorecard.kpiDetails.forEach(kpi => {
      if (!categoryMap.has(kpi.category)) {
        categoryMap.set(kpi.category, { totalScore: 0, totalWeight: 0 });
      }
      const cat = categoryMap.get(kpi.category)!;
      cat.totalWeight += kpi.weightage;
      cat.totalScore += (kpi.finalScore || 0) * kpi.weightage;
    });
    
    const categoryMetrics: CategoryMetric[] = Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      percentage: data.totalWeight > 0 ? (data.totalScore / data.totalWeight / 5) * 100 : 0,
      weightage: data.totalWeight,
      score: data.totalWeight > 0 ? data.totalScore / data.totalWeight : 0,
    }));
    
    yPos = drawCategoryChart(doc, categoryMetrics, margin, yPos, pageWidth - 2 * margin);
  }

  // ===== PAGE 2+: Detailed KPI Table =====
  doc.addPage('landscape');
  yPos = 15;
  
  // Table header
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('KPI Performance Details', margin, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${scorecard.employeeName} • ${options.period} ${options.year}`, margin, yPos + 6);
  
  yPos += 12;
  
  // Build table data
  const tableData = scorecard.kpiDetails.map(kpi => {
    const criteriaIndicator = kpi.criteria?.toLowerCase().includes('lower') ? '↓' : '↑';
    return [
      truncateText(kpi.category, 15),
      truncateText(kpi.kraName, 25) + '\n' + truncateText(kpi.kpiName, 30),
      `${kpi.target || '-'}\n${criteriaIndicator} ${kpi.criteria || 'Higher is Better'}`,
      `${kpi.weightage}%`,
      // Self Review
      `${kpi.selfAchieved || '-'}\n${getRatingText(kpi.selfRating)}`,
      truncateText(kpi.selfRemarks, 25) || '-',
      // Manager Review
      `${formatScore(kpi.managerScore)}\n${getRatingText(kpi.managerRating)}`,
      truncateText(kpi.managerRemarks, 25) || '-',
      // Auditor Review
      `${formatScore(kpi.auditorScore)}\n${getRatingText(kpi.auditorRating)}`,
      // Final
      `${formatScore(kpi.finalScore)}\n${getRatingText(kpi.finalRating)}`,
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [[
      'Category',
      'KRA / KPI',
      'Target',
      'Wt.',
      'Self\nAchieved',
      'Self\nRemarks',
      'Manager\nScore',
      'Manager\nRemarks',
      'Auditor\nScore',
      'Final\nScore',
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 22 },  // Category
      1: { cellWidth: 45 },  // KRA/KPI
      2: { cellWidth: 28 },  // Target
      3: { cellWidth: 12, halign: 'center' },  // Weight
      4: { cellWidth: 22, halign: 'center' },  // Self Achieved
      5: { cellWidth: 35 },  // Self Remarks
      6: { cellWidth: 22, halign: 'center' },  // Manager Score
      7: { cellWidth: 35 },  // Manager Remarks
      8: { cellWidth: 22, halign: 'center' },  // Auditor Score
      9: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },  // Final
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.grayMedium);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  •  Generated: ${new Date().toLocaleDateString()}  •  ${options.companyName || ''}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    },
  });

  // Update footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(
      `Page ${i} of ${pageCount}  •  Generated: ${new Date().toLocaleDateString()}  •  ${options.companyName || ''}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  // Save
  const fileName = `Performance_Dashboard_${scorecard.employeeCode}_${options.period}_${options.year}.pdf`;
  doc.save(fileName.replace(/\s+/g, '_'));
}

// Keep legacy function for backwards compatibility
export const generateScorecardPdf = generateDetailedScorecardPdf;

export function generateBulkScorecardPdf(
  scorecards: EmployeeScorecard[],
  options: PdfExportOptions
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let yPos = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('Performance Management Dashboard', margin, yPos);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${options.companyName || 'Organization'} • Monthly Scorecard Report • ${options.period} ${options.year}`, margin, yPos + 7);

  yPos += 18;

  // Summary Stats
  const totalEmployees = scorecards.length;
  const totalKpis = scorecards.reduce((sum, sc) => sum + sc.totalKpis, 0);
  const totalApproved = scorecards.reduce((sum, sc) => sum + sc.approvedKpis, 0);
  const avgFinal = totalEmployees > 0 
    ? scorecards.reduce((sum, sc) => sum + sc.avgFinalScore, 0) / totalEmployees 
    : 0;

  // Stats boxes
  const statsBoxWidth = (pageWidth - 2 * margin - 30) / 4;
  const stats = [
    { label: 'Total Employees', value: totalEmployees.toString(), color: COLORS.primary },
    { label: 'Total KPIs', value: totalKpis.toString(), color: COLORS.success },
    { label: 'Approved KPIs', value: totalApproved.toString(), color: COLORS.warning },
    { label: 'Avg Final Score', value: avgFinal.toFixed(2), color: getScoreColor(avgFinal) },
  ];

  stats.forEach((stat, index) => {
    const boxX = margin + (index * (statsBoxWidth + 10));
    
    doc.setFillColor(...COLORS.grayLight);
    doc.roundedRect(boxX, yPos, statsBoxWidth, 20, 2, 2, 'F');
    
    // Left color accent
    doc.setFillColor(...stat.color);
    doc.roundedRect(boxX, yPos, 3, 20, 1, 1, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(stat.label, boxX + 8, yPos + 8);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text(stat.value, boxX + 8, yPos + 16);
  });

  yPos += 30;

  // Main Table
  const tableData = scorecards.map(sc => [
    sc.employeeCode,
    sc.employeeName,
    sc.designation || '-',
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
    styles: { 
      fontSize: 8, 
      cellPadding: 3,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: { 
      fillColor: COLORS.primary, 
      textColor: COLORS.white, 
      fontSize: 8,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 32 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
      8: { cellWidth: 20, halign: 'center' },
      9: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.grayMedium);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  •  Generated: ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    },
  });

  // Save
  doc.save(`Scorecard_Report_${options.period}_${options.year}.pdf`);
}

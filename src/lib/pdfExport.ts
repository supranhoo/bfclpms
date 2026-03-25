import jsPDF from 'jspdf';
import autoTable, { RowInput, CellDef, CellHookData } from 'jspdf-autotable';
import { RatingLevel, ratingToLevel } from './ratingCalculation';
import { format } from 'date-fns';

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
  avgSkipLevelScore?: number | null;
  avgHrPmsScore?: number | null;
  avgAuditorScore: number;
  avgManagementScore: number;
  avgFinalScore: number;
  hasSelfData?: boolean;
  hasManagerData?: boolean;
  hasSkipLevelData?: boolean;
  hasHrPmsData?: boolean;
  hasAuditorData?: boolean;
  hasManagementData?: boolean;
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
  
  // Skip-Level Review
  skipLevelAchieved?: string | number | null;
  skipLevelScore?: number | null;
  skipLevelRating?: string | null;
  skipLevelRemarks?: string | null;
  skipLevelEvidence?: string | null;
  
  // HR PMS Review
  hrPmsAchieved?: string | number | null;
  hrPmsScore?: number | null;
  hrPmsRating?: string | null;
  hrPmsRemarks?: string | null;
  hrPmsEvidence?: string | null;
  
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
  primaryLight: [219, 234, 254] as [number, number, number], // Blue-100
  success: [34, 197, 94] as [number, number, number],       // Green-500
  successLight: [220, 252, 231] as [number, number, number], // Green-100
  warning: [234, 179, 8] as [number, number, number],       // Yellow-500
  warningLight: [254, 249, 195] as [number, number, number], // Yellow-100
  danger: [239, 68, 68] as [number, number, number],        // Red-500 (score 1)
  dangerLight: [254, 226, 226] as [number, number, number], // Red-100
  dangerSoft: [254, 202, 202] as [number, number, number],  // Pink (score 2 - Needs Improvement)
  dangerDeep: [127, 29, 29] as [number, number, number],    // Deep Maroon (score 0 - Not Achieved)
  gray: [156, 163, 175] as [number, number, number],        // Gray-400
  grayLight: [243, 244, 246] as [number, number, number],   // Gray-100
  grayMedium: [107, 114, 128] as [number, number, number],  // Gray-500
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

const CATEGORY_COLORS: { [key: string]: [number, number, number] } = {
  'ER & IR': [239, 246, 255],
  'HR Operations': [240, 253, 244],
  'Compliance': [254, 252, 232],
  'Training': [254, 242, 242],
  'Performance': [245, 243, 255],
  'Finance': [236, 253, 245],
  'Sales': [255, 247, 237],
  'Operations': [240, 249, 255],
  'default': [249, 250, 251],
};

const getCategoryColor = (category: string): [number, number, number] => {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['default'];
};

const getRatingColor = (rating: string | number | null): [number, number, number] => {
  if (rating === null || rating === undefined) return COLORS.gray;
  if (typeof rating === 'number') {
    if (rating >= 5) return COLORS.primary;
    if (rating >= 4) return COLORS.success;
    if (rating >= 3) return COLORS.warning;
    if (rating >= 2) return COLORS.dangerSoft;
    if (rating >= 1) return COLORS.danger;
    return COLORS.dangerDeep;
  }
  switch (rating.toLowerCase()) {
    case 'blue': return COLORS.primary;
    case 'green': return COLORS.success;
    case 'yellow': return COLORS.warning;
    case 'red': return COLORS.danger;
    default: return COLORS.gray;
  }
};

const getRatingLightColor = (rating: string | number | null): [number, number, number] => {
  if (rating === null || rating === undefined) return COLORS.grayLight;
  if (typeof rating === 'number') {
    if (rating >= 5) return COLORS.primaryLight;
    if (rating >= 4) return COLORS.successLight;
    if (rating >= 3) return COLORS.warningLight;
    return COLORS.dangerLight;
  }
  switch (rating.toLowerCase()) {
    case 'blue': return COLORS.primaryLight;
    case 'green': return COLORS.successLight;
    case 'yellow': return COLORS.warningLight;
    case 'red': return COLORS.dangerLight;
    default: return COLORS.grayLight;
  }
};

const getScoreColor = (score: number | null): [number, number, number] => {
  if (score === null) return COLORS.gray;
  if (score >= 5) return COLORS.primary;
  if (score >= 4) return COLORS.success;
  if (score >= 3) return COLORS.warning;
  if (score >= 2) return COLORS.dangerSoft;
  if (score >= 1) return COLORS.danger;
  return COLORS.dangerDeep;
};

const getRatingLabel = (score: number | null): string => {
  if (score === null || score === undefined) return '-';
  if (score >= 4) return 'B';
  if (score >= 3) return 'G';
  if (score >= 2) return 'Y';
  return 'R';
};

// ============= Formatters =============

const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return '-';
  return score.toFixed(2);
};

/** Format score with null-check: returns '-' for null/undefined, '0.00' for zero */
const formatScoreNullSafe = (score: number | null | undefined): string => {
  if (score == null) return '-';
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
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, 'F');
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
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    const label = cat.weightage 
      ? `${truncateText(cat.name, 18)} (${cat.weightage}%)`
      : truncateText(cat.name, 22);
    doc.text(label, x, currentY + barHeight / 2 + 1);
    
    const percentage = Math.min(cat.percentage, 100);
    const color = getScoreColor(cat.percentage / 20);
    drawProgressBar(doc, barX, currentY - 2, barWidth, barHeight, percentage, color);
    
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
  
  doc.setFillColor(...COLORS.grayLight);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(x, y, width, boxHeight, 3, 3, 'FD');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('EMPLOYEE PROFILE', x + 5, y + 8);
  
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
  const ratingBoxWidth = 50;
  const statusBoxWidth = 55;
  
  // Total Score Section
  doc.setFillColor(...COLORS.grayLight);
  doc.roundedRect(x, y, width - ratingBoxWidth - statusBoxWidth - 10, boxHeight, 3, 3, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('TOTAL SCORE', x + 8, y + 12);
  
  // Bug 1 Fix: Use weighted average score out of 5.00 instead of meaningless point totals
  const percentage = scorecard.avgFinalScore > 0 ? (scorecard.avgFinalScore / 5) * 100 : 0;
  
  // Progress bar
  const barWidth = width - ratingBoxWidth - statusBoxWidth - 80;
  const color = getScoreColor(scorecard.avgFinalScore);
  drawProgressBar(doc, x + 8, y + 20, barWidth, 10, percentage, color);
  
  // Score text — percentage
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text(`${formatPercentage(percentage)}`, x + barWidth + 15, y + 27);
  
  // Score text — weighted average out of 5.00
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${formatScore(scorecard.avgFinalScore)} / 5.00`, x + 8, y + 40);
  
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

function drawLegendBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number
): number {
  const boxHeight = 18;
  const boxWidth = Math.min(width, 180);
  
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(x + width - boxWidth, y, boxWidth, boxHeight, 2, 2, 'FD');
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('RATING SCALE:', x + width - boxWidth + 4, y + 6);
  
  const badges = [
    { label: 'B (5)', color: COLORS.primary },
    { label: 'G (4)', color: COLORS.success },
    { label: 'Y (3)', color: COLORS.warning },
    { label: 'R (1-2)', color: COLORS.danger },
  ];
  
  let badgeX = x + width - boxWidth + 35;
  badges.forEach((badge) => {
    doc.setFillColor(...badge.color);
    doc.roundedRect(badgeX, y + 2, 16, 6, 1, 1, 'F');
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text(badge.label, badgeX + 2, y + 6);
    badgeX += 20;
  });
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('[+] Met Target    [-] Below Target    * Has Notes', x + width - boxWidth + 4, y + 14);
  
  return y + boxHeight + 4;
}

interface ReviewNote {
  index: number;
  kpiName: string;
  stage: string;
  remarks: string;
  evidence?: string;
}

// Review stage colors matching the UI ReviewTrailCard
const STAGE_COLORS = {
  self: {
    border: [59, 130, 246] as [number, number, number],
    bg: [239, 246, 255] as [number, number, number],
    text: [30, 64, 175] as [number, number, number],
  },
  manager: {
    border: [245, 158, 11] as [number, number, number],
    bg: [255, 251, 235] as [number, number, number],
    text: [146, 64, 14] as [number, number, number],
  },
  skipLevel: {
    border: [20, 184, 166] as [number, number, number],
    bg: [240, 253, 250] as [number, number, number],
    text: [19, 78, 74] as [number, number, number],
  },
  hrPms: {
    border: [244, 63, 94] as [number, number, number],
    bg: [255, 241, 242] as [number, number, number],
    text: [159, 18, 57] as [number, number, number],
  },
  auditor: {
    border: [139, 92, 246] as [number, number, number],
    bg: [245, 243, 255] as [number, number, number],
    text: [91, 33, 182] as [number, number, number],
  },
  management: {
    border: [16, 185, 129] as [number, number, number],
    bg: [236, 253, 245] as [number, number, number],
    text: [6, 95, 70] as [number, number, number],
  },
};

/**
 * Draws a detailed KPI review card similar to ReviewTrailCard in the UI
 */
function drawKpiDetailCard(
  doc: jsPDF,
  kpi: KpiDetail,
  x: number,
  y: number,
  width: number
): number {
  let currentY = y;
  const panelPadding = 4;
  const thirdWidth = (width - 12) / 3;
  
  // ===== Card Header =====
  const headerHeight = 16;
  doc.setFillColor(...getCategoryColor(kpi.category));
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(x, currentY, width, headerHeight, 2, 2, 'FD');
  
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(x + 4, currentY + 3, 50, 10, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text(truncateText(kpi.category, 18), x + 6, currentY + 9);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text(truncateText(kpi.kpiName, 60), x + 58, currentY + 9);
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  const headerInfo = `Weight: ${kpi.weightage}%  |  Target: ${kpi.target ?? '-'} ${kpi.uom || ''}  |  Criteria: ${kpi.criteria || 'Higher'}`;
  doc.text(truncateText(headerInfo, 70), x + width - 4, currentY + 9, { align: 'right' });
  
  currentY += headerHeight + 2;
  
  // ===== Achieved Value Bar =====
  const achievedHeight = 14;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(x, currentY, width, achievedHeight, 2, 2, 'FD');
  
  const achieved = kpi.selfAchieved ?? '-';
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text(`Achieved: ${achieved}`, x + 4, currentY + 9);
  
  if (kpi.finalScore !== null) {
    const badgeWidth = 35;
    const badgeX = x + width - badgeWidth - 4;
    doc.setFillColor(...getRatingColor(kpi.finalScore));
    doc.roundedRect(badgeX, currentY + 2, badgeWidth, 10, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text(`Final: ${formatScore(kpi.finalScore)}`, badgeX + 3, currentY + 8);
  }
  
  currentY += achievedHeight + 2;
  
  // ===== Review Panels (3x2 Grid) =====
  const panelHeight = 42;
  
  const drawPanel = (
    panelX: number,
    panelY: number,
    panelW: number,
    title: string,
    score: number | null,
    rating: string | null,
    remarks: string | null,
    evidence: string | null,
    colors: { border: [number, number, number]; bg: [number, number, number]; text: [number, number, number] }
  ) => {
    doc.setFillColor(...colors.bg);
    doc.setDrawColor(...colors.border);
    doc.roundedRect(panelX, panelY, panelW, panelHeight, 2, 2, 'FD');
    
    doc.setFillColor(...colors.border);
    doc.roundedRect(panelX + 3, panelY + 3, 8, 8, 4, 4, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colors.text);
    doc.text(title, panelX + 14, panelY + 9);
    
    if (score !== null && score !== undefined) {
      doc.setFillColor(...getRatingColor(score));
      doc.roundedRect(panelX + panelW - 28, panelY + 3, 25, 8, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.white);
      doc.text(`${formatScore(score)} ${getRatingLabel(score)}`, panelX + panelW - 26, panelY + 8);
    } else {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.grayMedium);
      doc.text('Pending', panelX + panelW - 20, panelY + 8);
    }
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    
    const remarksText = remarks || 'No remarks provided';
    const maxWidth = panelW - 8;
    const lines = doc.splitTextToSize(remarksText, maxWidth);
    const maxLines = 4;
    const displayLines = lines.slice(0, maxLines);
    
    let textY = panelY + 17;
    displayLines.forEach((line: string, i: number) => {
      if (i === maxLines - 1 && lines.length > maxLines) {
        doc.text(line.substring(0, line.length - 3) + '...', panelX + 4, textY);
      } else {
        doc.text(line, panelX + 4, textY);
      }
      textY += 4;
    });
    
    if (evidence) {
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.primary);
      doc.text('[Evidence attached]', panelX + 4, panelY + panelHeight - 3);
    }
  };
  
  // Row 1: Self Review + Manager Review + Skip-Level Review
  drawPanel(x, currentY, thirdWidth, 'Self Review', kpi.selfScore, kpi.selfRating, kpi.selfRemarks || null, kpi.selfEvidence || null, STAGE_COLORS.self);
  drawPanel(x + thirdWidth + 6, currentY, thirdWidth, 'Manager Review', kpi.managerScore, kpi.managerRating, kpi.managerRemarks || null, kpi.managerEvidence || null, STAGE_COLORS.manager);
  drawPanel(x + (thirdWidth + 6) * 2, currentY, thirdWidth, 'Skip-Level', kpi.skipLevelScore ?? null, kpi.skipLevelRating ?? null, kpi.skipLevelRemarks || null, kpi.skipLevelEvidence || null, STAGE_COLORS.skipLevel);
  
  currentY += panelHeight + 3;
  
  // Row 2: HR PMS Review + Auditor Review + Final/Management
  drawPanel(x, currentY, thirdWidth, 'HR PMS Review', kpi.hrPmsScore ?? null, kpi.hrPmsRating ?? null, kpi.hrPmsRemarks || null, kpi.hrPmsEvidence || null, STAGE_COLORS.hrPms);
  drawPanel(x + thirdWidth + 6, currentY, thirdWidth, 'Auditor Review', kpi.auditorScore, kpi.auditorRating, kpi.auditorRemarks || null, kpi.auditorEvidence || null, STAGE_COLORS.auditor);
  
  // Final Assessment Panel
  const finalX = x + (thirdWidth + 6) * 2;
  doc.setFillColor(...STAGE_COLORS.management.bg);
  doc.setDrawColor(...STAGE_COLORS.management.border);
  doc.roundedRect(finalX, currentY, thirdWidth, panelHeight, 2, 2, 'FD');
  
  doc.setFillColor(...STAGE_COLORS.management.border);
  doc.roundedRect(finalX + 3, currentY + 3, 8, 8, 4, 4, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...STAGE_COLORS.management.text);
  doc.text('Final Assessment', finalX + 14, currentY + 9);
  
  if (kpi.finalScore !== null) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...getRatingColor(kpi.finalScore));
    doc.text(formatScore(kpi.finalScore), finalX + 10, currentY + 26);
    
    doc.setFontSize(10);
    doc.text('/ 5', finalX + 30, currentY + 26);
    
    const ratingMap: Record<string, string> = {
      blue: 'Outstanding',
      green: 'Exceeds Expectations',
      yellow: 'Meets Expectations',
      red: 'Below Expectations',
    };
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.black);
    doc.text(ratingMap[kpi.finalRating?.toLowerCase() || ''] || 'N/A', finalX + 10, currentY + 34);
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text('Pending', finalX + 10, currentY + 26);
  }
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(...COLORS.success);
  doc.roundedRect(finalX + thirdWidth - 35, currentY + 30, 32, 8, 2, 2, 'F');
  doc.setTextColor(...COLORS.white);
  doc.text(kpi.status || 'Open', finalX + thirdWidth - 33, currentY + 35);
  
  currentY += panelHeight + 8;
  
  return currentY;
}

function estimateKpiCardHeight(): number {
  return 16 + 2 + 14 + 2 + 42 + 3 + 42 + 8;
}

function drawReviewNotesSection(
  doc: jsPDF,
  notes: ReviewNote[],
  x: number,
  y: number,
  width: number,
  maxHeight: number
): number {
  if (notes.length === 0) return y;
  
  let currentY = y;
  
  doc.setFillColor(...COLORS.grayLight);
  doc.roundedRect(x, currentY, width, 8, 1, 1, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('REVIEW TRAIL NOTES', x + 4, currentY + 5.5);
  currentY += 11;
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.black);
  
  const lineHeight = 4;
  const maxLines = Math.floor((maxHeight - 15) / lineHeight);
  let linesUsed = 0;
  
  for (const note of notes) {
    if (linesUsed >= maxLines) {
      doc.text('... (additional notes on next page)', x + 4, currentY);
      break;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(`[${note.index}]`, x + 4, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(`${note.stage}:`, x + 14, currentY);
    
    doc.setTextColor(...COLORS.black);
    const remarkLines = doc.splitTextToSize(note.remarks, width - 50);
    const linesToShow = Math.min(remarkLines.length, 2);
    
    for (let i = 0; i < linesToShow; i++) {
      doc.text(remarkLines[i], x + 30, currentY);
      currentY += lineHeight;
      linesUsed++;
    }
    
    if (remarkLines.length > 2) {
      doc.setTextColor(...COLORS.grayMedium);
      doc.text('...', x + 30, currentY - lineHeight);
    }
    
    if (note.evidence) {
      doc.setTextColor(...COLORS.primary);
      doc.setFontSize(6);
      doc.text('[Ev] Evidence attached', x + width - 30, currentY - lineHeight);
      doc.setFontSize(7);
    }
    
    currentY += 1;
  }
  
  return currentY;
}

function drawDetailedReviewTrailPages(
  doc: jsPDF,
  scorecard: EmployeeScorecard,
  options: PdfExportOptions,
  margin: number
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 2 * margin;
  
  const groupedKpis = new Map<string, KpiDetail[]>();
  scorecard.kpiDetails.forEach(kpi => {
    if (!groupedKpis.has(kpi.category)) {
      groupedKpis.set(kpi.category, []);
    }
    groupedKpis.get(kpi.category)!.push(kpi);
  });
  
  let kpiIndex = 0;
  const totalKpis = scorecard.kpiDetails.length;
  
  Array.from(groupedKpis.entries()).forEach(([category, kpis]) => {
    kpis.forEach((kpi) => {
      kpiIndex++;
      doc.addPage('landscape');
      let yPos = 15;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.primaryDark);
      doc.text('Detailed Review Trail', margin, yPos);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.grayMedium);
      doc.text(
        `${scorecard.employeeName} (${scorecard.employeeCode}) • ${options.period} ${options.year} • KPI ${kpiIndex} of ${totalKpis}`,
        margin, yPos + 6
      );
      
      yPos += 14;
      yPos = drawKpiDetailCard(doc, kpi, margin, yPos, contentWidth);
    });
  });
}

// ============= Shared KPI Table Builder =============

/**
 * Builds the KPI Performance Details table data with proper null-safe score formatting.
 * Bug 2 Fix: Column 3 is now "Self" (self_score) instead of "Self Ach." (achieved value).
 *            Target column shows "Target / Achieved" format.
 * Bug 3 Fix: All score checks use != null instead of truthy checks.
 */
function buildKpiTableData(
  scorecard: EmployeeScorecard
): { tableData: RowInput[]; reviewNotes: ReviewNote[] } {
  const groupedKpis = new Map<string, KpiDetail[]>();
  scorecard.kpiDetails.forEach(kpi => {
    if (!groupedKpis.has(kpi.category)) {
      groupedKpis.set(kpi.category, []);
    }
    groupedKpis.get(kpi.category)!.push(kpi);
  });
  
  const tableData: RowInput[] = [];
  const reviewNotes: ReviewNote[] = [];
  let noteIndex = 1;
  
  Array.from(groupedKpis.entries()).forEach(([category, kpis]) => {
    const catWeight = kpis.reduce((sum, k) => sum + k.weightage, 0);
    const catScore = kpis.reduce((sum, k) => sum + (k.finalScore || 0) * k.weightage, 0);
    const catAvg = catWeight > 0 ? catScore / catWeight : 0;
    
    tableData.push([{
      content: `${category}   |   Avg: ${catAvg.toFixed(2)}   |   Weight: ${catWeight}%`,
      colSpan: 11,
      styles: {
        fillColor: getCategoryColor(category),
        fontStyle: 'bold',
        fontSize: 8,
        textColor: COLORS.grayMedium,
        halign: 'left',
      }
    }] as CellDef[]);
    
    kpis.forEach(kpi => {
      const target = kpi.target ?? '-';
      const achieved = kpi.selfAchieved ?? '-';
      const isLower = kpi.criteria?.toLowerCase().includes('lower');
      
      let targetMet = false;
      if (target !== '-' && achieved !== '-') {
        const targetNum = typeof target === 'number' ? target : parseFloat(String(target));
        const achievedNum = typeof achieved === 'number' ? achieved : parseFloat(String(achieved));
        if (!isNaN(targetNum) && !isNaN(achievedNum)) {
          targetMet = isLower ? achievedNum <= targetNum : achievedNum >= targetNum;
        }
      }
      
      // Collect notes
      const hasNotes = kpi.selfRemarks || kpi.managerRemarks || kpi.skipLevelRemarks || kpi.hrPmsRemarks || kpi.auditorRemarks || kpi.managementRemarks;
      let noteRef = '';
      
      if (kpi.selfRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'Self', remarks: kpi.selfRemarks, evidence: kpi.selfEvidence || undefined });
        noteRef = `[${noteIndex}]`; noteIndex++;
      }
      if (kpi.managerRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'Manager', remarks: kpi.managerRemarks, evidence: kpi.managerEvidence || undefined });
        if (!noteRef) noteRef = `[${noteIndex}]`; else noteRef += `,${noteIndex}`; noteIndex++;
      }
      if (kpi.skipLevelRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'Skip-Level', remarks: kpi.skipLevelRemarks, evidence: kpi.skipLevelEvidence || undefined });
        if (!noteRef) noteRef = `[${noteIndex}]`; else noteRef += `,${noteIndex}`; noteIndex++;
      }
      if (kpi.hrPmsRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'HR PMS', remarks: kpi.hrPmsRemarks, evidence: kpi.hrPmsEvidence || undefined });
        if (!noteRef) noteRef = `[${noteIndex}]`; else noteRef += `,${noteIndex}`; noteIndex++;
      }
      if (kpi.auditorRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'Auditor', remarks: kpi.auditorRemarks, evidence: kpi.auditorEvidence || undefined });
        if (!noteRef) noteRef = `[${noteIndex}]`; else noteRef += `,${noteIndex}`; noteIndex++;
      }
      if (kpi.managementRemarks) {
        reviewNotes.push({ index: noteIndex, kpiName: kpi.kpiName, stage: 'Management', remarks: kpi.managementRemarks });
        if (!noteRef) noteRef = `[${noteIndex}]`; else noteRef += `,${noteIndex}`; noteIndex++;
      }
      
      const kpiNameContent = truncateText(kpi.kpiName, 35) + (noteRef ? ` ${noteRef}` : '');
      // Bug 2 Fix: Target column now shows "target / achieved"
      const targetContent = `${target}${kpi.uom ? ` ${kpi.uom}` : ''}`;
      const achievedContent = achieved !== '-' ? `${achieved}${targetMet ? ' [+]' : ' [-]'}` : '-';
      
      tableData.push([
        { content: kpiNameContent, styles: { halign: 'left' } } as CellDef,
        { content: `${kpi.weightage}%`, styles: { halign: 'center' } } as CellDef,
        { content: targetContent, styles: { halign: 'center' } } as CellDef,
        { content: achievedContent, styles: { halign: 'center' } } as CellDef,
        // Bug 2 Fix: Self column now shows self_score instead of achieved value
        // Bug 3 Fix: null-safe checks for all score columns
        { content: kpi.selfScore != null ? formatScore(kpi.selfScore) : '-', styles: { halign: 'center' } } as CellDef,
        { content: kpi.managerScore != null ? formatScore(kpi.managerScore) : '-', styles: { halign: 'center' } } as CellDef,
        { content: kpi.skipLevelScore != null ? formatScore(kpi.skipLevelScore) : '-', styles: { halign: 'center' } } as CellDef,
        { content: kpi.hrPmsScore != null ? formatScore(kpi.hrPmsScore) : '-', styles: { halign: 'center' } } as CellDef,
        { content: kpi.auditorScore != null ? formatScore(kpi.auditorScore) : '-', styles: { halign: 'center' } } as CellDef,
        {
          content: `${formatScore(kpi.finalScore)} ${getRatingLabel(kpi.finalScore)}`,
          styles: {
            fontStyle: 'bold',
            fillColor: getRatingLightColor(kpi.finalScore),
            textColor: getRatingColor(kpi.finalScore),
            halign: 'center',
          }
        } as CellDef,
        { content: hasNotes ? '*' : '', styles: { halign: 'center' } } as CellDef,
      ]);
    });
  });
  
  return { tableData, reviewNotes };
}

/** KPI table header definition — consistent across both PDF functions */
const KPI_TABLE_HEAD: CellDef[][] = [[
  { content: 'KPI Name', styles: { halign: 'left' } } as CellDef,
  { content: 'W', styles: { halign: 'center' } } as CellDef,
  { content: 'Target', styles: { halign: 'center' } } as CellDef,
  { content: 'Achieved', styles: { halign: 'center' } } as CellDef,
  { content: 'Self', styles: { halign: 'center' } } as CellDef,
  { content: 'Mgr', styles: { halign: 'center' } } as CellDef,
  { content: 'Skip-L', styles: { halign: 'center' } } as CellDef,
  { content: 'HR PMS', styles: { halign: 'center' } } as CellDef,
  { content: 'Auditor', styles: { halign: 'center' } } as CellDef,
  { content: 'Final', styles: { halign: 'center' } } as CellDef,
  { content: '*', styles: { halign: 'center' } } as CellDef,
]];

/** Column styles for the 11-column KPI table */
const KPI_TABLE_COLUMN_STYLES = {
  0: { cellWidth: 55, halign: 'left' as const },
  1: { cellWidth: 12, halign: 'center' as const },
  2: { cellWidth: 20, halign: 'center' as const },
  3: { cellWidth: 20, halign: 'center' as const },
  4: { cellWidth: 16, halign: 'center' as const },
  5: { cellWidth: 16, halign: 'center' as const },
  6: { cellWidth: 16, halign: 'center' as const },
  7: { cellWidth: 16, halign: 'center' as const },
  8: { cellWidth: 16, halign: 'center' as const },
  9: { cellWidth: 22, halign: 'center' as const },
  10: { cellWidth: 8, halign: 'center' as const },
};

// ============= Bug 5 Fix: Shared PDF builder to eliminate duplication =============

/**
 * Builds the complete detailed scorecard PDF document.
 * Both generateDetailedScorecardPdf and generateDetailedScorecardPdfBlob call this.
 */
function buildDetailedScorecardDoc(
  scorecard: EmployeeScorecard,
  options: PdfExportOptions
): jsPDF {
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
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('Performance Management Dashboard', margin, yPos);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${options.companyName || 'Organization'} • ${options.period} ${options.year}`, margin, yPos + 7);
  
  yPos += 18;
  yPos = drawProfileBox(doc, scorecard, margin, yPos, pageWidth - 2 * margin);
  yPos = drawScoreSummaryBox(doc, scorecard, margin, yPos, pageWidth - 2 * margin);
  
  // Performance by Category Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text('PERFORMANCE BY CATEGORY', margin, yPos + 5);
  yPos += 12;
  
  if (scorecard.categoryMetrics && scorecard.categoryMetrics.length > 0) {
    yPos = drawCategoryChart(doc, scorecard.categoryMetrics, margin, yPos, pageWidth - 2 * margin);
  } else {
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

  // ===== PAGE 2+: KPI Performance Details Table =====
  doc.addPage('landscape');
  yPos = 15;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('KPI Performance Details', margin, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${scorecard.employeeName} (${scorecard.employeeCode}) • ${options.period} ${options.year}`, margin, yPos + 6);
  
  yPos = drawLegendBox(doc, margin, yPos - 2, pageWidth - 2 * margin);
  yPos += 2;
  
  // Build table data using shared builder
  const { tableData } = buildKpiTableData(scorecard);

  autoTable(doc, {
    startY: yPos,
    head: KPI_TABLE_HEAD,
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: KPI_TABLE_COLUMN_STYLES,
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    margin: { left: margin, right: margin, bottom: 45 },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.grayMedium);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}  •  Generated: ${format(new Date(), 'dd MMM yyyy')}  •  ${options.companyName || ''}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    },
  });

  // ===== PAGES 3+: Detailed Review Trail Cards =====
  drawDetailedReviewTrailPages(doc, scorecard, options, margin);

  // Update footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(
      `Page ${i} of ${pageCount}  •  Generated: ${format(new Date(), 'dd MMM yyyy')}  •  ${options.companyName || ''}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return doc;
}

// ============= Main Export Functions =============

export function generateDetailedScorecardPdf(
  scorecard: EmployeeScorecard,
  options: PdfExportOptions
): void {
  const doc = buildDetailedScorecardDoc(scorecard, options);
  const fileName = `Performance_Dashboard_${scorecard.employeeName}_${scorecard.employeeCode}_${options.period}_${options.year}.pdf`;
  doc.save(fileName.replace(/\s+/g, '_'));
}

// Keep legacy function for backwards compatibility
export const generateScorecardPdf = generateDetailedScorecardPdf;

// Generate PDF as Blob for preview (does not save, returns blob)
export function generateDetailedScorecardPdfBlob(
  scorecard: EmployeeScorecard,
  options: PdfExportOptions
): Blob {
  const doc = buildDetailedScorecardDoc(scorecard, options);
  return doc.output('blob');
}

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

  // Bug 4 Fix: Use null-safe check instead of ?? 0 for missing workflow stages
  const tableData = scorecards.map(sc => [
    sc.employeeCode,
    sc.employeeName,
    sc.designation || '-',
    sc.department,
    `${sc.approvedKpis}/${sc.totalKpis}`,
    formatScore(sc.avgSelfScore),
    formatScore(sc.avgManagerScore),
    sc.avgSkipLevelScore != null ? formatScore(sc.avgSkipLevelScore) : '-',
    sc.avgHrPmsScore != null ? formatScore(sc.avgHrPmsScore) : '-',
    formatScore(sc.avgAuditorScore),
    formatScore(sc.avgManagementScore),
    formatScore(sc.avgFinalScore),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Code', 'Name', 'Designation', 'Dept', 'KPIs', 'Self', 'Mgr', 'Skip-L', 'HR PMS', 'Auditor', 'Mgmt', 'Final']],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontSize: 7, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 32 },
      2: { cellWidth: 28 },
      3: { cellWidth: 26 },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { cellWidth: 16, halign: 'center' },
      9: { cellWidth: 16, halign: 'center' },
      10: { cellWidth: 16, halign: 'center' },
      11: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
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
        `Page ${data.pageNumber} of ${pageCount}  •  Generated: ${format(new Date(), 'dd MMM yyyy')}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    },
  });

  doc.save(`Scorecard_Report_${options.period}_${options.year}.pdf`);
}

// ============= Review Timeline PDF =============

export interface ReviewTimelinePdfData {
  employeeName: string;
  employeeCode: string;
  reportingManagerName: string;
  kpi: {
    kraName: string;
    kpiName: string;
    category: string;
    target: string | number | null;
    uom: string | null;
    criteria: string | null;
    weightage: number | null;
    frequency: string | null;
    status: string;
  };
  stages: Array<{
    title: string;
    score: number | null;
    rating: string | null;
    achievedValue: number | null;
    remarks: string | null;
    status: 'completed' | 'current' | 'pending';
  }>;
  period: string;
  year: string;
  companyName?: string;
  isNA?: boolean;
}

const TIMELINE_STAGE_COLORS: Record<string, { border: [number, number, number]; bg: [number, number, number]; text: [number, number, number] }> = {
  'Self': STAGE_COLORS.self,
  'Manager': STAGE_COLORS.manager,
  'Skip-Level': STAGE_COLORS.skipLevel,
  'HR PMS': STAGE_COLORS.hrPms,
  'Auditor': STAGE_COLORS.auditor,
  'Management': STAGE_COLORS.management,
};

export function exportReviewTimelinePdf(data: ReviewTimelinePdfData): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 15;

  // Header
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text(data.companyName || 'Review Timeline Report', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${data.period} ${data.year}`, margin, 20);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy')}`, pageWidth - margin, 20, { align: 'right' });
  y = 36;

  // Employee Profile Box
  const profileBoxHeight = 28;
  doc.setFillColor(...COLORS.grayLight);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, contentWidth, profileBoxHeight, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('EMPLOYEE DETAILS', margin + 5, y + 8);

  const profileFields = [
    { label: 'Name', value: data.employeeName || '-' },
    { label: 'Employee Code', value: data.employeeCode || '-' },
    { label: 'Reporting Manager', value: data.reportingManagerName || '-' },
  ];
  const colW = contentWidth / 3;
  profileFields.forEach((field, i) => {
    const fieldX = margin + 5 + i * colW;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(field.label, fieldX, y + 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text(truncateText(field.value, 28), fieldX, y + 22);
  });
  y += profileBoxHeight + 8;

  // KPI Details Box
  const kpiBoxHeight = 42;
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, y, contentWidth, kpiBoxHeight, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('KPI DETAILS', margin + 5, y + 8);

  const kpiRow1 = [
    { label: 'Category', value: data.kpi.category || '-' },
    { label: 'KRA', value: data.kpi.kraName || '-' },
    { label: 'KPI Name', value: data.kpi.kpiName || '-' },
    { label: 'Status', value: data.kpi.status || '-' },
  ];
  const kpiRow2 = [
    { label: 'Target', value: data.kpi.target != null ? String(data.kpi.target) : '-' },
    { label: 'UOM', value: data.kpi.uom || '-' },
    { label: 'Criteria', value: data.kpi.criteria || '-' },
    { label: 'Weightage', value: data.kpi.weightage != null ? `${data.kpi.weightage}%` : '-' },
  ];

  const kpiColW = contentWidth / 4;
  kpiRow1.forEach((field, i) => {
    const fieldX = margin + 5 + i * kpiColW;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(field.label, fieldX, y + 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text(truncateText(field.value, 22), fieldX, y + 21);
  });
  kpiRow2.forEach((field, i) => {
    const fieldX = margin + 5 + i * kpiColW;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(field.label, fieldX, y + 29);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text(truncateText(field.value, 22), fieldX, y + 35);
  });
  y += kpiBoxHeight + 8;

  // N/A Banner
  if (data.isNA) {
    doc.setFillColor(254, 249, 195);
    doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('This KPI has been marked as Not Applicable (N/A)', margin + 5, y + 7);
    y += 14;
  }

  // Review Stages Section
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.black);
  doc.text('REVIEW JOURNEY', margin, y + 4);
  y += 8;

  const stagesPerRow = Math.min(data.stages.length, 3);
  const stageCardW = (contentWidth - (stagesPerRow - 1) * 4) / stagesPerRow;
  const stageCardH = 38;

  data.stages.forEach((stage, i) => {
    const col = i % stagesPerRow;
    const row = Math.floor(i / stagesPerRow);
    const stageX = margin + col * (stageCardW + 4);
    const stageY = y + row * (stageCardH + 4);

    // Check if we need a new page
    if (stageY + stageCardH > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 15;
    }

    const colors = TIMELINE_STAGE_COLORS[stage.title] || STAGE_COLORS.self;
    const isPending = stage.status === 'pending';

    // Card background
    doc.setFillColor(...(isPending ? COLORS.grayLight : colors.bg));
    doc.setDrawColor(...(isPending ? COLORS.gray : colors.border));
    doc.roundedRect(stageX, stageY, stageCardW, stageCardH, 2, 2, 'FD');

    // Status indicator dot
    const dotColor: [number, number, number] = stage.status === 'completed'
      ? COLORS.success
      : stage.status === 'current'
        ? COLORS.warning
        : COLORS.gray;
    doc.setFillColor(...dotColor);
    doc.circle(stageX + 6, stageY + 7, 2, 'F');

    // Title
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(isPending ? COLORS.grayMedium : colors.text));
    doc.text(stage.title, stageX + 12, stageY + 8);

    // Status label
    const statusLabel = stage.status === 'completed' ? 'Completed' : stage.status === 'current' ? 'In Progress' : 'Pending';
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(statusLabel, stageX + stageCardW - 5, stageY + 8, { align: 'right' });

    if (!isPending) {
      // Score
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.grayMedium);
      doc.text('Score:', stageX + 5, stageY + 16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(isPending ? COLORS.grayMedium : colors.text));
      doc.text(formatScore(stage.score), stageX + 20, stageY + 16);

      // Rating
      if (stage.rating) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.grayMedium);
        doc.text('Rating:', stageX + 35, stageY + 16);
        doc.setFont('helvetica', 'bold');
        doc.text(truncateText(stage.rating, 12), stageX + 52, stageY + 16);
      }

      // Achieved Value
      if (stage.achievedValue !== null) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.grayMedium);
        doc.text(`Achieved: ${formatScore(stage.achievedValue)}`, stageX + 5, stageY + 23);
      }

      // Remarks
      if (stage.remarks) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.grayMedium);
        doc.text(truncateText(stage.remarks, 55), stageX + 5, stageY + 30);
      }
    }
  });

  // Calculate final y after stages
  const totalRows = Math.ceil(data.stages.length / stagesPerRow);
  y += totalRows * (stageCardH + 4) + 4;

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(
      `Page ${p} of ${pageCount}  •  Generated: ${format(new Date(), 'dd MMM yyyy')}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  const safeName = (data.employeeName || 'Employee').replace(/[^a-zA-Z0-9]/g, '_');
  const safeKpi = (data.kpi.kpiName || 'KPI').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  doc.save(`Review_Timeline_${safeName}_${safeKpi}_${data.period}_${data.year}.pdf`);
}

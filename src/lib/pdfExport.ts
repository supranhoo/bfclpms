import jsPDF from 'jspdf';
import autoTable, { RowInput, CellDef, CellHookData } from 'jspdf-autotable';
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
  primaryLight: [219, 234, 254] as [number, number, number], // Blue-100
  success: [34, 197, 94] as [number, number, number],       // Green-500
  successLight: [220, 252, 231] as [number, number, number], // Green-100
  warning: [234, 179, 8] as [number, number, number],       // Yellow-500
  warningLight: [254, 249, 195] as [number, number, number], // Yellow-100
  danger: [239, 68, 68] as [number, number, number],        // Red-500
  dangerLight: [254, 226, 226] as [number, number, number], // Red-100
  gray: [156, 163, 175] as [number, number, number],        // Gray-400
  grayLight: [243, 244, 246] as [number, number, number],   // Gray-100
  grayMedium: [107, 114, 128] as [number, number, number],  // Gray-500
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

// Category colors for visual grouping
const CATEGORY_COLORS: { [key: string]: [number, number, number] } = {
  'ER & IR': [239, 246, 255],      // Blue-50
  'HR Operations': [240, 253, 244], // Green-50
  'Compliance': [254, 252, 232],   // Yellow-50
  'Training': [254, 242, 242],     // Red-50
  'Performance': [245, 243, 255],  // Purple-50
  'Finance': [236, 253, 245],      // Emerald-50
  'Sales': [255, 247, 237],        // Orange-50
  'Operations': [240, 249, 255],   // Sky-50
  'default': [249, 250, 251],      // Gray-50
};

const getCategoryColor = (category: string): [number, number, number] => {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['default'];
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

const getRatingLightColor = (rating: string | number | null): [number, number, number] => {
  if (rating === null || rating === undefined) return COLORS.grayLight;
  
  if (typeof rating === 'number') {
    if (rating >= 4) return COLORS.primaryLight;
    if (rating >= 3) return COLORS.successLight;
    if (rating >= 2) return COLORS.warningLight;
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
  if (score >= 4) return COLORS.primary;
  if (score >= 3) return COLORS.success;
  if (score >= 2) return COLORS.warning;
  return COLORS.danger;
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

function drawLegendBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number
): number {
  const boxHeight = 18;
  const boxWidth = Math.min(width, 180);
  
  // Box background
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(x + width - boxWidth, y, boxWidth, boxHeight, 2, 2, 'FD');
  
  // Title
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('RATING SCALE:', x + width - boxWidth + 4, y + 6);
  
  // Rating badges
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
  
  // Indicators
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

function drawReviewNotesSection(
  doc: jsPDF,
  notes: ReviewNote[],
  x: number,
  y: number,
  width: number,
  maxHeight: number
): number {
  if (notes.length === 0) return y;
  
  const startY = y;
  let currentY = y;
  
  // Section header
  doc.setFillColor(...COLORS.grayLight);
  doc.roundedRect(x, currentY, width, 8, 1, 1, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text('REVIEW TRAIL NOTES', x + 4, currentY + 5.5);
  currentY += 11;
  
  // Notes content
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
    
    // Note reference number
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(`[${note.index}]`, x + 4, currentY);
    
    // Stage badge
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.grayMedium);
    doc.text(`${note.stage}:`, x + 14, currentY);
    
    // Remarks (wrapped text)
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
    
    // Evidence link indicator
    if (note.evidence) {
      doc.setTextColor(...COLORS.primary);
      doc.setFontSize(6);
      doc.text('[Ev] Evidence attached', x + width - 30, currentY - lineHeight);
      doc.setFontSize(7);
    }
    
    currentY += 1; // Gap between notes
  }
  
  return currentY;
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

  // ===== PAGE 2+: Enhanced KPI Performance Details Table =====
  doc.addPage('landscape');
  yPos = 15;
  
  // Table header with legend
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('KPI Performance Details', margin, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${scorecard.employeeName} (${scorecard.employeeCode}) • ${options.period} ${options.year}`, margin, yPos + 6);
  
  // Legend box in top-right
  yPos = drawLegendBox(doc, margin, yPos - 2, pageWidth - 2 * margin);
  yPos += 2;
  
  // Group KPIs by category
  const groupedKpis = new Map<string, KpiDetail[]>();
  scorecard.kpiDetails.forEach(kpi => {
    if (!groupedKpis.has(kpi.category)) {
      groupedKpis.set(kpi.category, []);
    }
    groupedKpis.get(kpi.category)!.push(kpi);
  });
  
  // Build table data with category headers and collect notes
  const tableData: RowInput[] = [];
  const reviewNotes: ReviewNote[] = [];
  let noteIndex = 1;
  
  Array.from(groupedKpis.entries()).forEach(([category, kpis]) => {
    // Calculate category averages
    const catWeight = kpis.reduce((sum, k) => sum + k.weightage, 0);
    const catScore = kpis.reduce((sum, k) => sum + (k.finalScore || 0) * k.weightage, 0);
    const catAvg = catWeight > 0 ? catScore / catWeight : 0;
    
    // Category header row - single row spanning all 8 columns
    tableData.push([{
      content: `${category}   |   Avg: ${catAvg.toFixed(2)}   |   Weight: ${catWeight}%`,
      colSpan: 8,
      styles: {
        fillColor: getCategoryColor(category),
        fontStyle: 'bold',
        fontSize: 8,
        textColor: COLORS.grayMedium,
        halign: 'left',
      }
    }] as CellDef[]);
    
    // KPI rows
    kpis.forEach(kpi => {
      const target = kpi.target ?? '-';
      const achieved = kpi.selfAchieved ?? '-';
      const isLower = kpi.criteria?.toLowerCase().includes('lower');
      
      // Determine if target was met
      let targetMet = false;
      if (target !== '-' && achieved !== '-') {
        const targetNum = typeof target === 'number' ? target : parseFloat(String(target));
        const achievedNum = typeof achieved === 'number' ? achieved : parseFloat(String(achieved));
        if (!isNaN(targetNum) && !isNaN(achievedNum)) {
          targetMet = isLower ? achievedNum <= targetNum : achievedNum >= targetNum;
        }
      }
      
      // Collect notes for this KPI
      const hasNotes = kpi.selfRemarks || kpi.managerRemarks || kpi.auditorRemarks || kpi.managementRemarks;
      let noteRef = '';
      
      if (kpi.selfRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Self',
          remarks: kpi.selfRemarks,
          evidence: kpi.selfEvidence || undefined,
        });
        noteRef = `[${noteIndex}]`;
        noteIndex++;
      }
      if (kpi.managerRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Manager',
          remarks: kpi.managerRemarks,
          evidence: kpi.managerEvidence || undefined,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      if (kpi.auditorRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Auditor',
          remarks: kpi.auditorRemarks,
          evidence: kpi.auditorEvidence || undefined,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      if (kpi.managementRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Management',
          remarks: kpi.managementRemarks,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      
      // Build simplified cell contents - avoid multi-line where possible
      const kpiNameContent = truncateText(kpi.kpiName, 35) + (noteRef ? ` ${noteRef}` : '');
      const targetContent = `${target}${kpi.uom ? ` ${kpi.uom}` : ''}`;
      const achievedContent = achieved !== '-' ? `${achieved}${targetMet ? ' [+]' : ' [-]'}` : '-';
      
      tableData.push([
        // KRA / KPI name
        {
          content: kpiNameContent,
          styles: { halign: 'left' }
        } as CellDef,
        // Weight
        {
          content: `${kpi.weightage}%`,
          styles: { halign: 'center' }
        } as CellDef,
        // Target
        {
          content: targetContent,
          styles: { halign: 'center' }
        } as CellDef,
        // Self Achieved
        {
          content: achievedContent,
          styles: { halign: 'center' }
        } as CellDef,
        // Manager Score
        {
          content: kpi.managerScore ? formatScore(kpi.managerScore) : '-',
          styles: { halign: 'center' }
        } as CellDef,
        // Auditor Score
        {
          content: kpi.auditorScore ? formatScore(kpi.auditorScore) : '-',
          styles: { halign: 'center' }
        } as CellDef,
        // Final score with rating badge
        {
          content: `${formatScore(kpi.finalScore)} ${getRatingLabel(kpi.finalScore)}`,
          styles: {
            fontStyle: 'bold',
            fillColor: getRatingLightColor(kpi.finalScore),
            textColor: getRatingColor(kpi.finalScore),
            halign: 'center',
          }
        } as CellDef,
        // Notes indicator
        {
          content: hasNotes ? '*' : '',
          styles: { halign: 'center' }
        } as CellDef,
      ]);
    });
  });

  // Create the table with simplified column structure
  autoTable(doc, {
    startY: yPos,
    head: [[
      { content: 'KPI Name', styles: { halign: 'left' } },
      { content: 'W', styles: { halign: 'center' } },
      { content: 'Target', styles: { halign: 'center' } },
      { content: 'Self Ach.', styles: { halign: 'center' } },
      { content: 'Mgr Score', styles: { halign: 'center' } },
      { content: 'Aud Score', styles: { halign: 'center' } },
      { content: 'Final', styles: { halign: 'center' } },
      { content: '*', styles: { halign: 'center' } },
    ]],
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
    columnStyles: {
      0: { cellWidth: 70, halign: 'left' },   // KPI Name
      1: { cellWidth: 14, halign: 'center' }, // Weight
      2: { cellWidth: 28, halign: 'center' }, // Target
      3: { cellWidth: 28, halign: 'center' }, // Self Achieved
      4: { cellWidth: 24, halign: 'center' }, // Manager Score
      5: { cellWidth: 24, halign: 'center' }, // Auditor Score
      6: { cellWidth: 28, halign: 'center' }, // Final
      7: { cellWidth: 10, halign: 'center' }, // Notes indicator
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    margin: { left: margin, right: margin, bottom: 45 },
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

  // Get final Y position from table
  const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
  
  // Draw Review Trail Notes section if space available
  const remainingSpace = pageHeight - finalY - 15;
  if (reviewNotes.length > 0 && remainingSpace > 25) {
    drawReviewNotesSection(doc, reviewNotes.slice(0, 10), margin, finalY + 5, pageWidth - 2 * margin, remainingSpace);
  }
  
  // If there are more notes, add them on a new page
  if (reviewNotes.length > 10) {
    doc.addPage('landscape');
    yPos = 15;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryDark);
    doc.text('Review Trail Notes (Continued)', margin, yPos);
    yPos += 10;
    
    drawReviewNotesSection(doc, reviewNotes.slice(10), margin, yPos, pageWidth - 2 * margin, pageHeight - yPos - 20);
  }

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

  // ===== PAGE 2+: Enhanced KPI Performance Details Table =====
  doc.addPage('landscape');
  yPos = 15;
  
  // Table header with legend
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primaryDark);
  doc.text('KPI Performance Details', margin, yPos);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.grayMedium);
  doc.text(`${scorecard.employeeName} (${scorecard.employeeCode}) • ${options.period} ${options.year}`, margin, yPos + 6);
  
  // Legend box in top-right
  yPos = drawLegendBox(doc, margin, yPos - 2, pageWidth - 2 * margin);
  yPos += 2;
  
  // Group KPIs by category
  const groupedKpis = new Map<string, KpiDetail[]>();
  scorecard.kpiDetails.forEach(kpi => {
    if (!groupedKpis.has(kpi.category)) {
      groupedKpis.set(kpi.category, []);
    }
    groupedKpis.get(kpi.category)!.push(kpi);
  });
  
  // Build table data with category headers and collect notes
  const tableData: RowInput[] = [];
  const reviewNotes: ReviewNote[] = [];
  let noteIndex = 1;
  
  Array.from(groupedKpis.entries()).forEach(([category, kpis]) => {
    // Calculate category averages
    const catWeight = kpis.reduce((sum, k) => sum + k.weightage, 0);
    const catScore = kpis.reduce((sum, k) => sum + (k.finalScore || 0) * k.weightage, 0);
    const catAvg = catWeight > 0 ? catScore / catWeight : 0;
    
    // Category header row - single row spanning all 8 columns
    tableData.push([{
      content: `${category}   |   Avg: ${catAvg.toFixed(2)}   |   Weight: ${catWeight}%`,
      colSpan: 8,
      styles: {
        fillColor: getCategoryColor(category),
        fontStyle: 'bold',
        fontSize: 8,
        textColor: COLORS.grayMedium,
        halign: 'left',
      }
    }] as CellDef[]);
    
    // KPI rows
    kpis.forEach(kpi => {
      const target = kpi.target ?? '-';
      const achieved = kpi.selfAchieved ?? '-';
      const isLower = kpi.criteria?.toLowerCase().includes('lower');
      
      // Determine if target was met
      let targetMet = false;
      if (target !== '-' && achieved !== '-') {
        const targetNum = typeof target === 'number' ? target : parseFloat(String(target));
        const achievedNum = typeof achieved === 'number' ? achieved : parseFloat(String(achieved));
        if (!isNaN(targetNum) && !isNaN(achievedNum)) {
          targetMet = isLower ? achievedNum <= targetNum : achievedNum >= targetNum;
        }
      }
      
      // Collect notes for this KPI
      const hasNotes = kpi.selfRemarks || kpi.managerRemarks || kpi.auditorRemarks || kpi.managementRemarks;
      let noteRef = '';
      
      if (kpi.selfRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Self',
          remarks: kpi.selfRemarks,
          evidence: kpi.selfEvidence || undefined,
        });
        noteRef = `[${noteIndex}]`;
        noteIndex++;
      }
      if (kpi.managerRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Manager',
          remarks: kpi.managerRemarks,
          evidence: kpi.managerEvidence || undefined,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      if (kpi.auditorRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Auditor',
          remarks: kpi.auditorRemarks,
          evidence: kpi.auditorEvidence || undefined,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      if (kpi.managementRemarks) {
        reviewNotes.push({
          index: noteIndex,
          kpiName: kpi.kpiName,
          stage: 'Management',
          remarks: kpi.managementRemarks,
        });
        if (!noteRef) noteRef = `[${noteIndex}]`;
        else noteRef += `,${noteIndex}`;
        noteIndex++;
      }
      
      // Build simplified cell contents - avoid multi-line where possible
      const kpiNameContent = truncateText(kpi.kpiName, 35) + (noteRef ? ` ${noteRef}` : '');
      const targetContent = `${target}${kpi.uom ? ` ${kpi.uom}` : ''}`;
      const achievedContent = achieved !== '-' ? `${achieved}${targetMet ? ' [+]' : ' [-]'}` : '-';
      
      tableData.push([
        // KPI name
        {
          content: kpiNameContent,
          styles: { halign: 'left' }
        } as CellDef,
        // Weight
        {
          content: `${kpi.weightage}%`,
          styles: { halign: 'center' }
        } as CellDef,
        // Target
        {
          content: targetContent,
          styles: { halign: 'center' }
        } as CellDef,
        // Self Achieved
        {
          content: achievedContent,
          styles: { halign: 'center' }
        } as CellDef,
        // Manager Score
        {
          content: kpi.managerScore ? formatScore(kpi.managerScore) : '-',
          styles: { halign: 'center' }
        } as CellDef,
        // Auditor Score
        {
          content: kpi.auditorScore ? formatScore(kpi.auditorScore) : '-',
          styles: { halign: 'center' }
        } as CellDef,
        // Final score with rating badge
        {
          content: `${formatScore(kpi.finalScore)} ${getRatingLabel(kpi.finalScore)}`,
          styles: {
            fontStyle: 'bold',
            fillColor: getRatingLightColor(kpi.finalScore),
            textColor: getRatingColor(kpi.finalScore),
            halign: 'center',
          }
        } as CellDef,
        // Notes indicator
        {
          content: hasNotes ? '*' : '',
          styles: { halign: 'center' }
        } as CellDef,
      ]);
    });
  });

  // Create the table with simplified column structure
  autoTable(doc, {
    startY: yPos,
    head: [[
      { content: 'KPI Name', styles: { halign: 'left' } },
      { content: 'W', styles: { halign: 'center' } },
      { content: 'Target', styles: { halign: 'center' } },
      { content: 'Self Ach.', styles: { halign: 'center' } },
      { content: 'Mgr Score', styles: { halign: 'center' } },
      { content: 'Aud Score', styles: { halign: 'center' } },
      { content: 'Final', styles: { halign: 'center' } },
      { content: '*', styles: { halign: 'center' } },
    ]],
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
    columnStyles: {
      0: { cellWidth: 70, halign: 'left' },   // KPI Name
      1: { cellWidth: 14, halign: 'center' }, // Weight
      2: { cellWidth: 28, halign: 'center' }, // Target
      3: { cellWidth: 28, halign: 'center' }, // Self Achieved
      4: { cellWidth: 24, halign: 'center' }, // Manager Score
      5: { cellWidth: 24, halign: 'center' }, // Auditor Score
      6: { cellWidth: 28, halign: 'center' }, // Final
      7: { cellWidth: 10, halign: 'center' }, // Notes indicator
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253],
    },
    margin: { left: margin, right: margin, bottom: 45 },
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

  // Get final Y position from table
  const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
  
  // Draw Review Trail Notes section if space available
  const remainingSpace = pageHeight - finalY - 15;
  if (reviewNotes.length > 0 && remainingSpace > 25) {
    drawReviewNotesSection(doc, reviewNotes.slice(0, 10), margin, finalY + 5, pageWidth - 2 * margin, remainingSpace);
  }
  
  // If there are more notes, add them on a new page
  if (reviewNotes.length > 10) {
    doc.addPage('landscape');
    yPos = 15;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primaryDark);
    doc.text('Review Trail Notes (Continued)', margin, yPos);
    yPos += 10;
    
    drawReviewNotesSection(doc, reviewNotes.slice(10), margin, yPos, pageWidth - 2 * margin, pageHeight - yPos - 20);
  }

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

  // Return as blob instead of saving
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

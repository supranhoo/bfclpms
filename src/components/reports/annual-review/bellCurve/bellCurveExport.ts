/**
 * ADR-218 — Bell Curve exports (Excel + PDF). Self-sufficient: everything is
 * derived from the already-fetched comprehensive rows plus the active config.
 */
import {
  BAND_LABELS,
  bandForRating,
  computeDistribution,
  computeSummary,
  groupDistribution,
  ratingOf,
  targetCurvePoints,
  type BellCurveConfig,
  type BellCurveInput,
} from '@/lib/annualReview/bellCurve';

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function employeeRows(rows: BellCurveInput[]) {
  return rows
    .filter((r) => !r.is_excluded)
    .map((r) => {
      const rating = ratingOf(r);
      const band = bandForRating(rating);
      return {
        'Employee Code': r.employee_code ?? '',
        'Employee Name': r.employee_name ?? '',
        'Designation': r.designation ?? '',
        'Department': r.department_name ?? '',
        'Business Unit': r.business_unit_name ?? '',
        'Manager': r.manager_name ?? '',
        'Final Score': r.total_score ?? '',
        'Rating (/5)': rating ?? '',
        'Rating Band': band ? `${BAND_LABELS[band]} (${band})` : 'Unrated',
      };
    });
}

function groupSheet(rows: BellCurveInput[], key: 'department' | 'business_unit' | 'manager', config: BellCurveConfig) {
  return groupDistribution(rows, key, config).map((g) => {
    const base: Record<string, string | number> = {
      Name: g.name,
      'Rated Employees': g.summary.ratedEmployees,
      'Average Rating': g.summary.averageRating ?? '',
      'Compliance %': g.summary.compliancePct,
      Status: g.worstCompliance,
    };
    for (const b of [...g.bands].reverse()) {
      base[`${BAND_LABELS[b.band]} (${b.band})`] = b.count;
      base[`${b.band} — Var %`] = b.variancePct;
    }
    return base;
  });
}

export async function exportBellCurveExcel(
  rows: BellCurveInput[],
  config: BellCurveConfig,
  cycleName: string,
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const bands = computeDistribution(rows, config);
  const summary = computeSummary(rows, config);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows(rows)), 'Employee Distribution');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...bands].reverse().map((b) => ({
      Rating: `${b.label} (${b.band})`,
      Count: b.count,
      'Target %': b.targetPct,
      'Actual %': b.actualPct,
      'Target Count': b.targetCount,
      'Variance %': b.variancePct,
      Compliance: b.compliance,
    }))),
    'Variance Analysis',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'department', config)), 'Department Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'business_unit', config)), 'Business Unit Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'manager', config)), 'Manager Summary');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([{
      Cycle: cycleName,
      'Total Employees': summary.totalEmployees,
      'Rated Employees': summary.ratedEmployees,
      Unrated: summary.unratedEmployees,
      'Average Rating': summary.averageRating ?? '',
      'Outstanding Count': summary.highestBandCount,
      'Unsatisfactory Count': summary.lowestBandCount,
      'Bell Curve Compliance %': summary.compliancePct,
      'Generated At': new Date().toISOString(),
    }]),
    'Management Summary',
  );

  XLSX.writeFile(wb, `bell-curve_${safeName(cycleName)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportBellCurvePdf(
  rows: BellCurveInput[],
  config: BellCurveConfig,
  cycleName: string,
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const bands = computeDistribution(rows, config);
  const summary = computeSummary(rows, config);

  doc.setFontSize(16);
  doc.text('Bell Curve Analysis', 40, 40);
  doc.setFontSize(10);
  doc.text(`${cycleName} · generated ${new Date().toLocaleString()}`, 40, 58);

  // KPI strip
  const kpis: Array<[string, string]> = [
    ['Total Employees', String(summary.totalEmployees)],
    ['Average Rating', summary.averageRating !== null ? summary.averageRating.toFixed(2) : '—'],
    ['Outstanding', String(summary.highestBandCount)],
    ['Unsatisfactory', String(summary.lowestBandCount)],
    ['Compliance %', `${summary.compliancePct}%`],
  ];
  kpis.forEach(([label, value], i) => {
    const x = 40 + i * 150;
    doc.setDrawColor(200);
    doc.roundedRect(x, 74, 138, 46, 4, 4);
    doc.setFontSize(8);
    doc.text(label, x + 10, 90);
    doc.setFontSize(14);
    doc.text(value, x + 10, 110);
  });

  // Bell curve plot
  const plotX = 40, plotY = 140, plotW = 380, plotH = 180;
  doc.setDrawColor(150);
  doc.rect(plotX, plotY, plotW, plotH);
  const curve = targetCurvePoints(config, summary.ratedEmployees);
  const maxY = Math.max(1, ...curve.map((p) => p.y), ...bands.map((b) => b.count));
  const px = (x: number) => plotX + ((x - 1) / 4) * plotW;
  const py = (y: number) => plotY + plotH - (y / maxY) * plotH;

  doc.setDrawColor(120);
  curve.forEach((p, i) => {
    if (i === 0) return;
    doc.line(px(curve[i - 1].x), py(curve[i - 1].y), px(p.x), py(p.y));
  });
  doc.setDrawColor(30, 90, 200);
  doc.setLineWidth(1.4);
  bands.forEach((b, i) => {
    if (i === 0) return;
    doc.line(px(bands[i - 1].band), py(bands[i - 1].count), px(b.band), py(b.count));
  });
  doc.setLineWidth(1);
  doc.setFontSize(7);
  bands.forEach((b) => doc.text(`${b.band}`, px(b.band) - 2, plotY + plotH + 12));
  doc.setFontSize(8);
  doc.text('Solid = actual · Grey = target curve', plotX, plotY + plotH + 26);

  autoTable(doc, {
    startY: 140,
    margin: { left: 450 },
    tableWidth: 350,
    styles: { fontSize: 8 },
    head: [['Rating', 'Count', 'Target %', 'Actual %', 'Var %', 'Status']],
    body: [...bands].reverse().map((b) => [
      `${b.label} (${b.band})`, b.count, `${b.targetPct}%`, `${b.actualPct}%`, `${b.variancePct}%`, b.compliance,
    ]),
  });

  doc.addPage();
  doc.setFontSize(13);
  doc.text('Department Summary', 40, 40);
  autoTable(doc, {
    startY: 56,
    styles: { fontSize: 8 },
    head: [['Department', 'Rated', 'Avg Rating', 'Compliance %', 'Status']],
    body: groupDistribution(rows, 'department', config).map((g) => [
      g.name, g.summary.ratedEmployees, g.summary.averageRating ?? '—', `${g.summary.compliancePct}%`, g.worstCompliance,
    ]),
  });

  doc.save(`bell-curve_${safeName(cycleName)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
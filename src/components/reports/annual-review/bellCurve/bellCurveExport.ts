/**
 * ADR-218 / ADR-218b — Bell Curve exports (Excel + PDF). Self-sufficient:
 * everything is derived from the already-fetched comprehensive rows, the active
 * config and the active banding (rating bands or increment slabs).
 */
import {
  BAND_MODE_LABELS,
  computeBands,
  groupBands,
  makeBanding,
  ratingOf,
  scoringSourceOf,
  summarize,
  targetCurvePoints,
  type Banding,
  type BellCurveConfig,
  type BellCurveInput,
  SCORING_SOURCE_LABELS,
} from '@/lib/annualReview/bellCurve';

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function bandLabelOf(rating: number | null, banding: Banding): string {
  if (rating === null) return 'Unrated';
  const key = banding.keyOf(rating);
  const def = banding.defs.find((d) => d.key === key);
  return def ? `${def.label} ${def.sub}` : 'Unrated';
}

function employeeRows(rows: BellCurveInput[], banding: Banding) {
  return rows
    .filter((r) => !r.is_excluded)
    .map((r) => {
      const rating = ratingOf(r);
      return {
        'Employee Code': r.employee_code ?? '',
        'Employee Name': r.employee_name ?? '',
        'Designation': r.designation ?? '',
        'Department': r.department_name ?? '',
        'Business Unit': r.business_unit_name ?? '',
        'Manager': r.manager_name ?? '',
        'Final Score': r.total_score ?? '',
        'Rating (/5)': rating ?? '',
        [banding.mode === 'slab' ? 'Slab Band' : 'Rating Band']: bandLabelOf(rating, banding),
        'Scoring Source': SCORING_SOURCE_LABELS[scoringSourceOf(r)],
      };
    });
}

function groupSheet(
  rows: BellCurveInput[],
  key: 'department' | 'business_unit' | 'manager',
  banding: Banding,
  config: BellCurveConfig,
) {
  return groupBands(rows, key, banding, config).map((g) => {
    const base: Record<string, string | number> = {
      Name: g.name,
      'Rated Employees': g.summary.ratedEmployees,
      'Average Rating': g.summary.averageRating ?? '',
    };
    if (banding.hasTargets) {
      base['Compliance %'] = g.summary.compliancePct;
      base.Status = g.worstCompliance ?? '';
    }
    for (const b of [...g.bands].reverse()) {
      base[`${b.label} ${b.sub}`] = b.count;
      if (b.variancePct !== null) base[`${b.label} — Var %`] = b.variancePct;
    }
    return base;
  });
}

export async function exportBellCurveExcel(
  rows: BellCurveInput[],
  config: BellCurveConfig,
  cycleName: string,
  filterNote?: string,
  banding: Banding = makeBanding('rating', config),
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const bands = computeBands(rows, banding, config);
  const summary = summarize(rows, banding, config);
  const bandTitle = banding.mode === 'slab' ? 'Slab' : 'Rating';

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows(rows, banding)), 'Employee Distribution');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...bands].reverse().map((b) => {
      const row: Record<string, string | number> = {
        [bandTitle]: `${b.label} ${b.sub}`,
        Count: b.count,
        'Actual %': b.actualPct,
      };
      if (banding.hasTargets) {
        row['Target %'] = b.targetPct ?? '';
        row['Target Count'] = b.targetCount ?? '';
        row['Variance %'] = b.variancePct ?? '';
        row.Compliance = b.compliance ?? '';
      }
      return row;
    })),
    banding.hasTargets ? 'Variance Analysis' : 'Slab Distribution',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'department', banding, config)), 'Department Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'business_unit', banding, config)), 'Business Unit Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupSheet(rows, 'manager', banding, config)), 'Manager Summary');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([{
      Cycle: cycleName,
      'Band Mode': BAND_MODE_LABELS[banding.mode],
      Filters: filterNote ?? '',
      'Total Employees': summary.totalEmployees,
      'Rated Employees': summary.ratedEmployees,
      Unrated: summary.unratedEmployees,
      'Average Rating': summary.averageRating ?? '',
      [`Top Band (${summary.highestBandLabel})`]: summary.highestBandCount,
      [`Bottom Band (${summary.lowestBandLabel})`]: summary.lowestBandCount,
      ...(banding.hasTargets
        ? { 'Bell Curve Compliance %': summary.compliancePct }
        : { 'Bands In Use': summary.bandsInUse }),
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
  filterNote?: string,
  banding: Banding = makeBanding('rating', config),
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const bands = computeBands(rows, banding, config);
  const summary = summarize(rows, banding, config);
  const withTargets = banding.hasTargets;

  doc.setFontSize(16);
  doc.text('Bell Curve Analysis', 40, 40);
  doc.setFontSize(10);
  doc.text(
    `${cycleName} · ${BAND_MODE_LABELS[banding.mode]} · generated ${new Date().toLocaleString()}${filterNote ? ` · ${filterNote}` : ''}`,
    40, 58,
  );

  // KPI strip
  const kpis: Array<[string, string]> = [
    ['Total Employees', String(summary.totalEmployees)],
    ['Average Rating', summary.averageRating !== null ? summary.averageRating.toFixed(2) : '—'],
    [summary.highestBandLabel, String(summary.highestBandCount)],
    [summary.lowestBandLabel, String(summary.lowestBandCount)],
    withTargets ? ['Compliance %', `${summary.compliancePct}%`] : ['Bands in use', String(summary.bandsInUse)],
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

  // Distribution plot
  const plotX = 40, plotY = 140, plotW = 380, plotH = 180;
  doc.setDrawColor(150);
  doc.rect(plotX, plotY, plotW, plotH);
  const curve = withTargets ? targetCurvePoints(config, summary.ratedEmployees) : [];
  const maxY = Math.max(1, ...curve.map((p) => p.y), ...bands.map((b) => b.count));
  const steps = Math.max(1, bands.length - 1);
  const px = withTargets
    ? (x: number) => plotX + ((x - 1) / 4) * plotW
    : (x: number) => plotX + ((x - 1) / steps) * plotW;
  const py = (y: number) => plotY + plotH - (y / maxY) * plotH;

  if (withTargets) {
    doc.setDrawColor(120);
    curve.forEach((p, i) => {
      if (i === 0) return;
      doc.line(px(curve[i - 1].x), py(curve[i - 1].y), px(p.x), py(p.y));
    });
  }
  doc.setDrawColor(30, 90, 200);
  doc.setLineWidth(1.4);
  bands.forEach((b, i) => {
    if (i === 0) return;
    doc.line(px(i), py(bands[i - 1].count), px(i + 1), py(b.count));
  });
  doc.setLineWidth(1);
  doc.setFontSize(7);
  bands.forEach((b, i) => doc.text(b.label, px(i + 1) - 6, plotY + plotH + 12));
  doc.setFontSize(8);
  doc.text(withTargets ? 'Solid = actual · Grey = target curve' : 'Solid = actual distribution', plotX, plotY + plotH + 26);

  autoTable(doc, {
    startY: 140,
    margin: { left: 450 },
    tableWidth: 350,
    styles: { fontSize: 8 },
    head: [withTargets
      ? [banding.mode === 'slab' ? 'Slab' : 'Rating', 'Count', 'Target %', 'Actual %', 'Var %', 'Status']
      : ['Slab', 'Count', 'Actual %']],
    body: [...bands].reverse().map((b) => (withTargets
      ? [`${b.label} ${b.sub}`, b.count, `${b.targetPct}%`, `${b.actualPct}%`, `${b.variancePct}%`, b.compliance ?? '']
      : [`${b.label} ${b.sub}`, b.count, `${b.actualPct}%`])),
  });

  doc.addPage();
  doc.setFontSize(13);
  doc.text('Department Summary', 40, 40);
  autoTable(doc, {
    startY: 56,
    styles: { fontSize: 8 },
    head: [withTargets
      ? ['Department', 'Rated', 'Avg Rating', 'Compliance %', 'Status']
      : ['Department', 'Rated', 'Avg Rating']],
    body: groupBands(rows, 'department', banding, config).map((g) => (withTargets
      ? [g.name, g.summary.ratedEmployees, g.summary.averageRating ?? '—', `${g.summary.compliancePct}%`, g.worstCompliance ?? '']
      : [g.name, g.summary.ratedEmployees, g.summary.averageRating ?? '—'])),
  });

  doc.save(`bell-curve_${safeName(cycleName)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

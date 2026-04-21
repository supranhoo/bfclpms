import { Button } from '@/components/ui/button';
import { FileBarChart } from 'lucide-react';
import * as XLSX from 'xlsx';
import { differenceInDays, parse } from 'date-fns';

export interface PendingReportRow {
  category: string;
  kraName: string;
  kpiName: string;
  target: number | null;
  uom: string | null;
  scope: string;
  status: 'Pending' | 'Entered' | 'Propagated' | 'Stuck';
  department: string;
  employee: string;
  employeeCode: string;
  achievedValue: number | null;
  remark: string;
  dataOwners: string;
  dataOwnerEmails: string;
  r5: string;
  r4: string;
  r3: string;
  r2: string;
  r1: string;
  frequency: string;
  previousValue: number | null;
  daysPending: number | null;
  employeeCount: number | null;
  daysSinceLastUpdate: number | null;
}

interface OrgKpiPendingReportProps {
  rows: PendingReportRow[];
  reviewPeriod: string;
  reviewYear: number;
}

export function OrgKpiPendingReport({ rows, reviewPeriod, reviewYear }: OrgKpiPendingReportProps) {
  const handleDownload = () => {
    if (rows.length === 0) return;

    // Stats
    const totalKpis = rows.length;
    const pendingCount = rows.filter(r => r.status === 'Pending').length;
    const enteredCount = rows.filter(r => r.status === 'Entered').length;
    const propagatedCount = rows.filter(r => r.status === 'Propagated').length;
    const stuckCount = rows.filter(r => r.status === 'Stuck').length;
    const completionPct = totalKpis > 0 ? Math.round(((enteredCount + propagatedCount) / totalKpis) * 100) : 0;

    // Distinct KPI counts (one card per category+KRA+KPI)
    const kpiKey = (r: PendingReportRow) => `${r.category}||${r.kraName}||${r.kpiName}`;
    const distinctTotalKpis = new Set(rows.map(kpiKey)).size;
    const distinctPendingKpis = new Set(rows.filter(r => r.status === 'Pending').map(kpiKey)).size;

    const toSheetRow = (r: PendingReportRow) => ({
      'Category': r.category,
      'KRA': r.kraName,
      'KPI Name': r.kpiName,
      'Target': r.target ?? '',
      'UOM': r.uom ?? '',
      'Scope': r.scope,
      'Status': r.status,
      'Department': r.department,
      'Employee': r.employee,
      'Employee Code': r.employeeCode,
      'Achieved Value': r.achievedValue ?? '',
      'Remark': r.remark,
      'Data Owner(s)': r.dataOwners,
      'Data Owner Email(s)': r.dataOwnerEmails,
      'R5': r.r5,
      'R4': r.r4,
      'R3': r.r3,
      'R2': r.r2,
      'R1': r.r1,
      'Frequency': r.frequency,
      'Previous Period Value': r.previousValue ?? '',
      'Days Pending': r.daysPending ?? '',
      'Days Since Last Update': r.daysSinceLastUpdate ?? '',
      'Employee Count': r.employeeCount ?? '',
    });

    const colWidths = [
      { wch: 18 }, { wch: 22 }, { wch: 35 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 14 },
      { wch: 14 }, { wch: 30 }, { wch: 25 }, { wch: 30 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Pending + Stuck (action-needed) ---
    // "Stuck" rows have a value entered but kpis.status never advanced — admin repair required.
    const pendingRows = rows.filter(r => r.status === 'Pending' || r.status === 'Stuck');
    const summaryPending = [
      [`Org KPI Pending Report — ${reviewPeriod} ${reviewYear}`],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [`${pendingCount} pending + ${stuckCount} stuck employee assignment(s) across ${distinctPendingKpis} distinct KPI(s). (Total: ${totalKpis} assignments / ${distinctTotalKpis} KPIs | Entered: ${enteredCount} | Propagated: ${propagatedCount} | Stuck: ${stuckCount} — admin repair needed | Completion: ${completionPct}%)`],
      [],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryPending);
    XLSX.utils.sheet_add_json(ws1, pendingRows.map(toSheetRow), { origin: 'A5' });
    ws1['!cols'] = colWidths;
    // Merge title row across columns
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Pending Only');

    // --- Sheet 2: Full Status ---
    const summaryFull = [
      [`Org KPI Full Status Report — ${reviewPeriod} ${reviewYear}`],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [`${totalKpis} employee assignment(s) across ${distinctTotalKpis} distinct KPI(s). (Pending: ${pendingCount} / ${distinctPendingKpis} KPIs | Entered: ${enteredCount} | Propagated: ${propagatedCount} | Stuck: ${stuckCount} | Completion: ${completionPct}%)`],
      [],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summaryFull);
    XLSX.utils.sheet_add_json(ws2, rows.map(toSheetRow), { origin: 'A5' });
    ws2['!cols'] = colWidths;
    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Full Status');

    XLSX.writeFile(wb, `Org_KPI_Pending_Report_${reviewPeriod}_${reviewYear}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5" disabled={rows.length === 0}>
      <FileBarChart className="h-4 w-4" />
      Pending Report
    </Button>
  );
}

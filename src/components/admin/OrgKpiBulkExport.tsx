import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrgKpiForExport {
  categoryName: string;
  kraName: string;
  kpiName: string;
  targetValue: number | null;
  uom: string | null;
  achievedValue: number | null;
  remarks: string;
  scope: string;
  departmentName?: string | null;
  employeeName?: string | null;
}

interface OrgKpiBulkExportProps {
  kpis: OrgKpiForExport[];
  reviewPeriod: string;
  reviewYear: number;
}

export function OrgKpiBulkExport({ kpis, reviewPeriod, reviewYear }: OrgKpiBulkExportProps) {
  const handleExport = () => {
    const rows = kpis.map(k => ({
      'Category': k.categoryName,
      'KRA': k.kraName,
      'KPI Name': k.kpiName,
      'Target': k.targetValue ?? '',
      'UOM': k.uom ?? '',
      'Scope': k.scope,
      'Department': k.departmentName ?? '',
      'Employee': k.employeeName ?? '',
      'Achieved Value': k.achievedValue ?? '',
      'Remark': k.remarks ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 25 }, { wch: 35 }, { wch: 12 }, { wch: 10 },
      { wch: 14 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Org KPI Template');
    XLSX.writeFile(wb, `Org_KPI_Template_${reviewPeriod}_${reviewYear}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="h-4 w-4" />
      Export Template
    </Button>
  );
}

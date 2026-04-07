import { useMemo, useCallback } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAllKpis } from '@/hooks/useKpis';
import { useKraCategories } from '@/hooks/useOrganization';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/layout/PageHeader';
import { FileText, CheckCircle2, Clock, AlertCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800',
  manager_check: 'bg-yellow-100 text-yellow-800',
  skip_level_check: 'bg-cyan-100 text-cyan-800',
  hr_pms_review: 'bg-pink-100 text-pink-800',
  audit: 'bg-purple-100 text-purple-800',
  management_review: 'bg-emerald-100 text-emerald-800',
  approved: 'bg-green-100 text-green-800',
};

const statusLabels: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  skip_level_check: 'Skip-Level',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
  approved: 'Approved',
};

export default function KRAIssuance() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('kra-issuance');
  const { data: allKpis, isLoading } = useAllKpis();
  const { data: categories } = useKraCategories();
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();

  const filteredKpis = useMemo(() => allKpis?.filter(k => filterByCompany(k.employee_id)) ?? [], [allKpis, filterByCompany]);

  const statusCounts = {
    kra_set: allKpis?.filter(k => k.status === 'kra_set').length || 0,
    self_review: allKpis?.filter(k => k.status === 'self_review').length || 0,
    manager_check: allKpis?.filter(k => k.status === 'manager_check').length || 0,
    skip_level_check: allKpis?.filter(k => k.status === 'skip_level_check').length || 0,
    hr_pms_review: allKpis?.filter(k => k.status === 'hr_pms_review').length || 0,
    audit: allKpis?.filter(k => k.status === 'audit').length || 0,
    management_review: allKpis?.filter(k => k.status === 'management_review').length || 0,
    approved: allKpis?.filter(k => k.status === 'approved').length || 0,
  };

  const total = allKpis?.length || 1;
  const completionRate = Math.round((statusCounts.approved / total) * 100);

  // Category breakdown
  const categoryBreakdown = categories?.map(cat => ({
    name: cat.name,
    color: cat.color,
    total: allKpis?.filter(k => k.category_id === cat.id).length || 0,
    approved: allKpis?.filter(k => k.category_id === cat.id && k.status === 'approved').length || 0,
  })) || [];

  const { toast } = useToast();

  const handleExportExcel = useCallback(() => {
    const exportData = categoryBreakdown.map(cat => ({
      'Category': cat.name,
      'Total KPIs': cat.total,
      'Approved': cat.approved,
      'Completion': cat.total > 0 ? `${Math.round((cat.approved / cat.total) * 100)}%` : '0%',
    }));

    // Add status summary
    const statusData = [
      { Status: 'KRA Set', Count: statusCounts.kra_set },
      { Status: 'Self Review', Count: statusCounts.self_review },
      { Status: 'Manager Check', Count: statusCounts.manager_check },
      { Status: 'Audit', Count: statusCounts.audit },
      { Status: 'Approved', Count: statusCounts.approved },
    ];

    const ws1 = XLSX.utils.json_to_sheet(exportData);
    const ws2 = XLSX.utils.json_to_sheet(statusData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'By Category');
    XLSX.utils.book_append_sheet(wb, ws2, 'By Status');
    XLSX.writeFile(wb, `KRA_Issuance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [categoryBreakdown, statusCounts, toast]);

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KRA Issuance Report"
        description="Track KPI issuance and completion status"
        backTo="/reports"
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Issued</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{allKpis?.length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-yellow-600">{statusCounts.kra_set}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-blue-600">{statusCounts.self_review + statusCounts.manager_check + statusCounts.audit}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-600">{statusCounts.approved}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Completion Rate</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between"><span>Overall Progress</span><span className="font-bold">{completionRate}%</span></div>
            <Progress value={completionRate} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="text-center p-4 rounded-lg border">
                <Badge className={statusColors[key as keyof typeof statusColors]}>{label}</Badge>
                <p className="text-2xl font-bold mt-2">{statusCounts[key as keyof typeof statusCounts]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>By Category</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Total KPIs</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryBreakdown.map(cat => (
                <TableRow key={cat.name}>
                  <TableCell><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />{cat.name}</div></TableCell>
                  <TableCell>{cat.total}</TableCell>
                  <TableCell>{cat.approved}</TableCell>
                  <TableCell><Progress value={cat.total > 0 ? (cat.approved / cat.total) * 100 : 0} className="w-24 h-2" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

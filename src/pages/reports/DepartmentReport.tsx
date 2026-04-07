import { useState, useMemo, useCallback } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAllKpis } from '@/hooks/useKpis';
import { useDepartments, useDivisions } from '@/hooks/useOrganization';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Building2, Download, Users, Target, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

export default function DepartmentReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('department');
  const { data: allKpis, isLoading } = useAllKpis();
  const { data: departments } = useDepartments();
  const { data: divisions } = useDivisions();
  const { toast } = useToast();

  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();
  // Build department stats
  const departmentData = useMemo(() => {
    if (!allKpis || !departments) return [];

    // Filter departments by division if selected
    const filteredDepts = selectedDivision === 'all' 
      ? departments 
      : departments.filter(d => d.business_units?.divisions?.id === selectedDivision);

    return filteredDepts.map(dept => {
      // Get KPIs for employees in this department
      const deptKpis = allKpis.filter(kpi => {
        const employee = kpi.profiles as { department_id?: string } | null;
        return employee?.department_id === dept.id && filterByCompany(kpi.employee_id);
      });

      const totalKpis = deptKpis.length;
      const approvedKpis = deptKpis.filter(k => k.status === 'approved').length;
      const uniqueEmployees = new Set(deptKpis.map(k => k.employee_id)).size;
      const completionRate = totalKpis > 0 ? Math.round((approvedKpis / totalKpis) * 100) : 0;

      // Status breakdown
      const statusBreakdown = {
        kra_set: deptKpis.filter(k => k.status === 'kra_set').length,
        self_review: deptKpis.filter(k => k.status === 'self_review').length,
        manager_check: deptKpis.filter(k => k.status === 'manager_check').length,
        skip_level_check: deptKpis.filter(k => k.status === 'skip_level_check').length,
        hr_pms_review: deptKpis.filter(k => k.status === 'hr_pms_review').length,
        audit: deptKpis.filter(k => k.status === 'audit').length,
        management_review: deptKpis.filter(k => k.status === 'management_review').length,
        approved: approvedKpis,
      };

      return {
        id: dept.id,
        name: dept.name,
        divisionName: dept.business_units?.divisions?.name || '-',
        businessUnitName: dept.business_units?.name || '-',
        totalKpis,
        approvedKpis,
        uniqueEmployees,
        completionRate,
        statusBreakdown,
      };
    }).filter(d => d.totalKpis > 0).sort((a, b) => b.completionRate - a.completionRate);
  }, [allKpis, departments, selectedDivision]);

  // Overall stats
  const stats = useMemo(() => {
    const totalDepts = departmentData.length;
    const totalKpis = departmentData.reduce((sum, d) => sum + d.totalKpis, 0);
    const totalApproved = departmentData.reduce((sum, d) => sum + d.approvedKpis, 0);
    const avgCompletion = totalDepts > 0 
      ? Math.round(departmentData.reduce((sum, d) => sum + d.completionRate, 0) / totalDepts) 
      : 0;

    return { totalDepts, totalKpis, totalApproved, avgCompletion };
  }, [departmentData]);

  const handleExportExcel = useCallback(() => {
    if (departmentData.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const exportData = departmentData.map(d => ({
      'Department': d.name,
      'Division': d.divisionName,
      'Business Unit': d.businessUnitName,
      'Total Employees': d.uniqueEmployees,
      'Total KPIs': d.totalKpis,
      'Approved': d.approvedKpis,
      'Completion Rate': `${d.completionRate}%`,
      'KRA Set': d.statusBreakdown.kra_set,
      'Self Review': d.statusBreakdown.self_review,
      'Manager Check': d.statusBreakdown.manager_check,
      'Skip-Level Check': d.statusBreakdown.skip_level_check,
      'HR PMS Review': d.statusBreakdown.hr_pms_review,
      'Audit': d.statusBreakdown.audit,
      'Management Review': d.statusBreakdown.management_review,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Department Summary');
    XLSX.writeFile(wb, `Department_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [departmentData, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Department Summary Report"
        description="KPI status and completion rates by department"
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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Departments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalDepts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalKpis}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalApproved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Completion</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgCompletion}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <CompanyFilter companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={setSelectedCompanyId} />
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              {divisions?.map(div => (
                <SelectItem key={div.id} value={div.id}>{div.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Department Details</CardTitle>
          <CardDescription>{departmentData.length} departments with KPIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-center">Total KPIs</TableHead>
                  <TableHead className="text-center">Approved</TableHead>
                  <TableHead>Completion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departmentData.map(dept => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell className="text-muted-foreground">{dept.divisionName}</TableCell>
                    <TableCell className="text-center">{dept.uniqueEmployees}</TableCell>
                    <TableCell className="text-center">{dept.totalKpis}</TableCell>
                    <TableCell className="text-center text-green-600">{dept.approvedKpis}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={dept.completionRate} className="w-24 h-2" />
                        <span className="text-sm font-medium w-12">{dept.completionRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {departmentData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No department data found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

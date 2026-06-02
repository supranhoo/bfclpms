import { useState, useMemo, useCallback } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAllKpis } from '@/hooks/useKpis';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Calendar, Download, TrendingUp, Target, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const CMP_DEFAULT_FIELDS = [
  { field_key: 'period',                default_label: 'Period',                default_sort: 10, is_required: true },
  { field_key: 'year',                  default_label: 'Year',                  default_sort: 20, is_required: true },
  { field_key: 'total_kpis',            default_label: 'Total KPIs',            default_sort: 30 },
  { field_key: 'self_review_submitted', default_label: 'Self Review Submitted', default_sort: 40 },
  { field_key: 'manager_reviewed',      default_label: 'Manager Reviewed',      default_sort: 50 },
  { field_key: 'skip_level_reviewed',   default_label: 'Skip-Level Reviewed',   default_sort: 60 },
  { field_key: 'hr_pms_reviewed',       default_label: 'HR PMS Reviewed',       default_sort: 70 },
  { field_key: 'auditor_reviewed',      default_label: 'Auditor Reviewed',      default_sort: 80 },
  { field_key: 'approved',              default_label: 'Approved',              default_sort: 90 },
  { field_key: 'not_submitted',         default_label: 'Not Submitted',         default_sort: 100 },
  { field_key: 'self_review_rate',      default_label: 'Self Review Rate',      default_sort: 110 },
  { field_key: 'completion_rate',       default_label: 'Completion Rate',       default_sort: 120 },
] as const;
import { useToast } from '@/hooks/use-toast';

const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];

export default function CompletionReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('completion');
  const { data: allKpis, isLoading } = useAllKpis();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<string>('all');
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();
  // Get available years
  const availableYears = useMemo(() => {
    if (!allKpis) return [];
    const years = [...new Set(allKpis.map(k => k.review_year).filter(Boolean))];
    return years.sort((a, b) => (b || 0) - (a || 0));
  }, [allKpis]);

  // Build period-wise completion data
  const periodData = useMemo(() => {
    if (!allKpis) return [];

    // Filter by year if selected
    const filteredKpis = (selectedYear === 'all' 
      ? allKpis 
      : allKpis.filter(k => k.review_year?.toString() === selectedYear))
      .filter(k => filterByCompany(k.employee_id));

    // Group by period
    const periodMap = new Map<string, { 
      total: number; 
      approved: number; 
      selfReviewSubmitted: number;
      managerReviewed: number;
      skipLevelReviewed: number;
      hrPmsReviewed: number;
      auditorReviewed: number;
      year: number 
    }>();

    filteredKpis.forEach(kpi => {
      const period = kpi.review_period || 'Unknown';
      const year = kpi.review_year || new Date().getFullYear();
      const key = `${period}-${year}`;
      
      if (!periodMap.has(key)) {
        periodMap.set(key, { total: 0, approved: 0, selfReviewSubmitted: 0, managerReviewed: 0, skipLevelReviewed: 0, hrPmsReviewed: 0, auditorReviewed: 0, year });
      }
      
      const data = periodMap.get(key)!;
      data.total++;
      
      const status = kpi.status || '';
      
      // Track different stages of completion (cumulative — each later stage implies earlier ones done)
      if (status === 'approved') {
        data.approved++;
        data.auditorReviewed++;
        data.hrPmsReviewed++;
        data.skipLevelReviewed++;
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'management_review') {
        data.auditorReviewed++;
        data.hrPmsReviewed++;
        data.skipLevelReviewed++;
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'audit') {
        data.hrPmsReviewed++;
        data.skipLevelReviewed++;
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'hr_pms_review') {
        data.skipLevelReviewed++;
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'skip_level_check') {
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'manager_check') {
        data.managerReviewed++;
        data.selfReviewSubmitted++;
      } else if (status === 'self_review') {
        data.selfReviewSubmitted++;
      }
    });

    // Convert to array and sort by year then month
    return Array.from(periodMap.entries())
      .map(([key, data]) => {
        const [period] = key.split('-');
        const completionRate = data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0;
        const selfReviewRate = data.total > 0 ? Math.round((data.selfReviewSubmitted / data.total) * 100) : 0;
        return {
          period,
          year: data.year,
          total: data.total,
          approved: data.approved,
          selfReviewSubmitted: data.selfReviewSubmitted,
          managerReviewed: data.managerReviewed,
          skipLevelReviewed: data.skipLevelReviewed,
          hrPmsReviewed: data.hrPmsReviewed,
          auditorReviewed: data.auditorReviewed,
          pending: data.total - data.approved,
          notSubmitted: data.total - data.selfReviewSubmitted,
          completionRate,
          selfReviewRate,
        };
      })
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return MONTH_ORDER.indexOf(a.period) - MONTH_ORDER.indexOf(b.period);
      });
  }, [allKpis, selectedYear]);

  // Chart data (last 6 periods)
  const chartData = useMemo(() => {
    return periodData.slice(0, 6).reverse().map(p => ({
      name: `${p.period.substring(0, 3)} ${p.year}`,
      'Self Review': p.selfReviewSubmitted,
      'Manager Review': p.managerReviewed,
      'Skip-Level': p.skipLevelReviewed,
      'HR PMS': p.hrPmsReviewed,
      'Auditor': p.auditorReviewed,
      Approved: p.approved,
      'Not Submitted': p.notSubmitted,
    }));
  }, [periodData]);

  // Overall stats
  const stats = useMemo(() => {
    const totalPeriods = periodData.length;
    const totalKpis = periodData.reduce((sum, p) => sum + p.total, 0);
    const totalApproved = periodData.reduce((sum, p) => sum + p.approved, 0);
    const totalSelfReviewSubmitted = periodData.reduce((sum, p) => sum + p.selfReviewSubmitted, 0);
    const avgCompletion = totalPeriods > 0 
      ? Math.round(periodData.reduce((sum, p) => sum + p.completionRate, 0) / totalPeriods) 
      : 0;
    const avgSelfReviewRate = totalPeriods > 0
      ? Math.round(periodData.reduce((sum, p) => sum + p.selfReviewRate, 0) / totalPeriods)
      : 0;

    return { totalPeriods, totalKpis, totalApproved, totalSelfReviewSubmitted, avgCompletion, avgSelfReviewRate };
  }, [periodData]);

  const handleExportExcel = useCallback(() => {
    if (periodData.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }

    const exportData = periodData.map(p => ({
      'Period': p.period,
      'Year': p.year,
      'Total KPIs': p.total,
      'Self Review Submitted': p.selfReviewSubmitted,
      'Manager Reviewed': p.managerReviewed,
      'Skip-Level Reviewed': p.skipLevelReviewed,
      'HR PMS Reviewed': p.hrPmsReviewed,
      'Auditor Reviewed': p.auditorReviewed,
      'Approved': p.approved,
      'Not Submitted': p.notSubmitted,
      'Self Review Rate': `${p.selfReviewRate}%`,
      'Completion Rate': `${p.completionRate}%`,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Completion Report');
    XLSX.writeFile(wb, `Completion_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [periodData, toast]);

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
        title="Completion Rate Report"
        description="Period-wise KPI completion trends"
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
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Periods</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPeriods}</div>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Self Review Done</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.totalSelfReviewSubmitted}</div>
            <p className="text-xs text-muted-foreground">{stats.avgSelfReviewRate}% avg rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.totalApproved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Completion</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
            <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(year => (
                <SelectItem key={year} value={year?.toString() || ''}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completion Trend</CardTitle>
            <CardDescription>KPI workflow progression by period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Self Review" fill="hsl(210, 80%, 60%)" />
                  <Bar dataKey="Manager Review" fill="hsl(38, 80%, 55%)" />
                  <Bar dataKey="Skip-Level" fill="hsl(174, 60%, 45%)" />
                  <Bar dataKey="HR PMS" fill="hsl(340, 65%, 55%)" />
                  <Bar dataKey="Auditor" fill="hsl(270, 60%, 55%)" />
                  <Bar dataKey="Approved" fill="hsl(145, 65%, 45%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Period Details</CardTitle>
          <CardDescription>{periodData.length} review periods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-center">Total KPIs</TableHead>
                  <TableHead className="text-center">Self Review</TableHead>
                  <TableHead className="text-center">Manager</TableHead>
                  <TableHead className="text-center">Skip-Level</TableHead>
                  <TableHead className="text-center">HR PMS</TableHead>
                  <TableHead className="text-center">Auditor</TableHead>
                  <TableHead className="text-center">Approved</TableHead>
                  <TableHead className="text-center">Not Submitted</TableHead>
                  <TableHead>Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodData.map(p => (
                  <TableRow key={`${p.period}-${p.year}`}>
                    <TableCell className="font-medium">{p.period}</TableCell>
                    <TableCell>{p.year}</TableCell>
                    <TableCell className="text-center">{p.total}</TableCell>
                    <TableCell className="text-center text-blue-600">{p.selfReviewSubmitted}</TableCell>
                    <TableCell className="text-center text-amber-600">{p.managerReviewed}</TableCell>
                    <TableCell className="text-center text-teal-600">{p.skipLevelReviewed}</TableCell>
                    <TableCell className="text-center text-rose-600">{p.hrPmsReviewed}</TableCell>
                    <TableCell className="text-center text-purple-600">{p.auditorReviewed}</TableCell>
                    <TableCell className="text-center text-emerald-600">{p.approved}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{p.notSubmitted}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={p.completionRate} className="w-24 h-2" />
                        <span className="text-sm font-medium w-12">{p.completionRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {periodData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No period data found
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

import { useState, useMemo, useCallback } from 'react';
import { useAllKpis } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Download, TrendingUp, Target, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];

export default function CompletionReport() {
  const { data: allKpis, isLoading } = useAllKpis();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<string>('all');

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
    const filteredKpis = selectedYear === 'all' 
      ? allKpis 
      : allKpis.filter(k => k.review_year?.toString() === selectedYear);

    // Group by period
    const periodMap = new Map<string, { total: number; approved: number; year: number }>();

    filteredKpis.forEach(kpi => {
      const period = kpi.review_period || 'Unknown';
      const year = kpi.review_year || new Date().getFullYear();
      const key = `${period}-${year}`;
      
      if (!periodMap.has(key)) {
        periodMap.set(key, { total: 0, approved: 0, year });
      }
      
      const data = periodMap.get(key)!;
      data.total++;
      if (kpi.status === 'approved') {
        data.approved++;
      }
    });

    // Convert to array and sort by year then month
    return Array.from(periodMap.entries())
      .map(([key, data]) => {
        const [period] = key.split('-');
        const completionRate = data.total > 0 ? Math.round((data.approved / data.total) * 100) : 0;
        return {
          period,
          year: data.year,
          total: data.total,
          approved: data.approved,
          pending: data.total - data.approved,
          completionRate,
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
      Approved: p.approved,
      Pending: p.pending,
      'Completion %': p.completionRate,
    }));
  }, [periodData]);

  // Overall stats
  const stats = useMemo(() => {
    const totalPeriods = periodData.length;
    const totalKpis = periodData.reduce((sum, p) => sum + p.total, 0);
    const totalApproved = periodData.reduce((sum, p) => sum + p.approved, 0);
    const avgCompletion = totalPeriods > 0 
      ? Math.round(periodData.reduce((sum, p) => sum + p.completionRate, 0) / totalPeriods) 
      : 0;

    return { totalPeriods, totalKpis, totalApproved, avgCompletion };
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
      'Approved': p.approved,
      'Pending': p.pending,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Completion Rate Report</h1>
          <p className="text-muted-foreground">Period-wise KPI completion trends</p>
        </div>
        <Button variant="outline" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" />
          Export Excel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalApproved}</div>
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
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completion Trend</CardTitle>
            <CardDescription>Approved vs Pending KPIs by period</CardDescription>
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
                  <Bar dataKey="Approved" fill="hsl(var(--primary))" />
                  <Bar dataKey="Pending" fill="hsl(var(--muted-foreground))" />
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
                  <TableHead className="text-center">Approved</TableHead>
                  <TableHead className="text-center">Pending</TableHead>
                  <TableHead>Completion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodData.map(p => (
                  <TableRow key={`${p.period}-${p.year}`}>
                    <TableCell className="font-medium">{p.period}</TableCell>
                    <TableCell>{p.year}</TableCell>
                    <TableCell className="text-center">{p.total}</TableCell>
                    <TableCell className="text-center text-green-600">{p.approved}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{p.pending}</TableCell>
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
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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

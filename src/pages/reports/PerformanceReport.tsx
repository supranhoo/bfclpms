import { useMemo, useCallback } from 'react';
import { useAllKpis, useReviewSubmissions } from '@/hooks/useKpis';
import { useProfiles, useKraCategories } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3, Users, Target, TrendingUp, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const ratingColors = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#3B82F6',
};

export default function PerformanceReport() {
  const { data: allKpis, isLoading: kpisLoading } = useAllKpis();
  const { data: profiles } = useProfiles();
  const { data: categories } = useKraCategories();
  const kpiIds = allKpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);

  const submissionMap = new Map(submissions?.map(s => [s.kpi_id, s]));

  // Calculate rating distribution
  const ratingDistribution = { red: 0, yellow: 0, green: 0, blue: 0 };
  submissions?.forEach(s => {
    const rating = s.final_rating || s.manager_rating || s.self_rating;
    if (rating) ratingDistribution[rating]++;
  });

  const ratingData = [
    { name: 'Below Expectations', value: ratingDistribution.red, color: ratingColors.red },
    { name: 'Meets Expectations', value: ratingDistribution.yellow, color: ratingColors.yellow },
    { name: 'Exceeds Expectations', value: ratingDistribution.green, color: ratingColors.green },
    { name: 'Outstanding', value: ratingDistribution.blue, color: ratingColors.blue },
  ].filter(r => r.value > 0);

  // Category performance
  const categoryPerformance = categories?.map(cat => {
    const catKpis = allKpis?.filter(k => k.category_id === cat.id) || [];
    let totalScore = 0;
    let count = 0;
    catKpis.forEach(kpi => {
      const sub = submissionMap.get(kpi.id);
      if (sub?.final_score || sub?.self_score) {
        totalScore += sub.final_score || sub.self_score || 0;
        count++;
      }
    });
    return {
      name: cat.name,
      avgScore: count > 0 ? Math.round(totalScore / count) : 0,
      kpiCount: catKpis.length,
      color: cat.color,
    };
  }) || [];

  const totalKpis = allKpis?.length || 0;
  const approvedKpis = allKpis?.filter(k => k.status === 'approved').length || 0;
  const avgScore = submissions?.length ? Math.round(submissions.reduce((sum, s) => sum + (s.final_score || s.self_score || 0), 0) / submissions.length) : 0;

  const { toast } = useToast();

  const handleExportExcel = useCallback(() => {
    const exportData = categoryPerformance.map(cat => ({
      'Category': cat.name,
      'KPI Count': cat.kpiCount,
      'Average Score': `${cat.avgScore}%`,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Performance Report');
    XLSX.writeFile(wb, `Performance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [categoryPerformance, toast]);

  if (kpisLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Report</h1>
          <p className="text-muted-foreground">Organization-wide performance analytics</p>
        </div>
        <Button variant="outline" onClick={handleExportExcel}>
          <Download className="h-4 w-4 mr-2" />
          Export Excel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalKpis}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{profiles?.length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-600">{approvedKpis}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Score</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{avgScore}%</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Rating Distribution</CardTitle></CardHeader>
          <CardContent>
            {ratingData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ratingData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {ratingData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Performance by Category</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

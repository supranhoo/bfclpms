import { useState, useMemo, useCallback } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAllKpis, useReviewSubmissions } from '@/hooks/useKpis';
import { useProfiles, useKraCategories } from '@/hooks/useOrganization';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BarChart3, Users, Target, TrendingUp, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

const ratingColors = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#3B82F6',
};

export default function PerformanceReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('performance');
  const { user, effectiveRole } = useAuth();
  const [categorySortBy, setCategorySortBy] = useState<'weightage-desc' | 'weightage-asc' | 'score-desc' | 'score-asc'>('score-desc');
  const { data: allKpis, isLoading: kpisLoading } = useAllKpis();
  const { data: profiles } = useProfiles();
  const { data: categories } = useKraCategories();

  // Determine scope: managers/employees see only team KPIs; org-wide roles see everything
  const isOrgWideRole = ['admin', 'management', 'auditor', 'hr_pms'].includes(effectiveRole || '');
  const scopeLabel = isOrgWideRole ? 'Organization Performance' : 'Team Performance';

  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();

  // Filter KPIs based on role scope + company
  const scopedKpis = useMemo(() => {
    if (!allKpis) return [];
    const roleFiltered = isOrgWideRole ? allKpis : allKpis.filter(k =>
      k.employee_id !== user?.id && !(k as any).is_org_level
    );
    return roleFiltered.filter(k => filterByCompany(k.employee_id));
  }, [allKpis, isOrgWideRole, user?.id, filterByCompany]);

  const kpiIds = scopedKpis.map(k => k.id);
  const { data: submissions } = useReviewSubmissions(kpiIds);

  const submissionMap = useMemo(() => new Map(submissions?.map(s => [s.kpi_id, s])), [submissions]);

  // Derive employee count from scoped KPIs, not from profiles
  const distinctEmployeeCount = useMemo(() => {
    const ids = new Set(scopedKpis.map(k => k.employee_id));
    return ids.size;
  }, [scopedKpis]);

  // Calculate rating distribution
  const ratingDistribution = { red: 0, yellow: 0, green: 0, blue: 0 };
  submissions?.forEach(s => {
    const rating = s.final_rating || s.management_rating || s.auditor_rating || s.hr_pms_rating || s.skip_level_rating || s.manager_rating || s.self_rating;
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
    const catKpis = scopedKpis.filter(k => k.category_id === cat.id);
    let totalScore = 0;
    let count = 0;
    catKpis.forEach(kpi => {
      const sub = submissionMap.get(kpi.id);
    const subScore = (kpi.status === 'approved' ? sub?.final_score : null) ?? sub?.management_score ?? sub?.auditor_score ?? sub?.hr_pms_score ?? sub?.skip_level_score ?? sub?.manager_score ?? sub?.self_score ?? null;
    if (subScore != null) {
        totalScore += subScore;
        count++;
      }
    });
    const dynamicWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);
    return {
      name: cat.name,
      avgScore: count > 0 ? Math.round(totalScore / count) : 0,
      kpiCount: catKpis.length,
      color: cat.color,
      weightage: dynamicWeightage,
    };
  }) || [];

  const totalKpis = scopedKpis.length;
  const approvedKpis = scopedKpis.filter(k => k.status === 'approved').length;
  const avgScore = submissions?.length ? Math.round(submissions.reduce((sum, s) => {
    const kpi = scopedKpis.find(k => k.id === (s as any).kpi_id);
    return sum + ((kpi?.status === 'approved' ? s.final_score : null) ?? s.management_score ?? s.auditor_score ?? s.hr_pms_score ?? s.skip_level_score ?? s.manager_score ?? s.self_score ?? 0);
  }, 0) / submissions.length) : 0;

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
      <PageHeader
        title="Performance Report"
        description={scopeLabel}
        backTo="/reports"
        actions={
          <div className="flex items-center gap-2">
            <CompanyFilter companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={setSelectedCompanyId} />
            <Badge variant={isOrgWideRole ? 'default' : 'secondary'}>
              {scopeLabel}
            </Badge>
            {canExport && (
              <Button variant="outline" onClick={handleExportExcel}>
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
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
          <CardContent><div className="text-3xl font-bold">{distinctEmployeeCount}</div></CardContent>
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
            <div style={{ height: Math.max(180, categoryPerformance.length * 36) }}>
              <div className="flex items-center justify-end gap-1 mb-2">
                <span className="text-xs text-muted-foreground mr-1">Sort:</span>
                {(['weightage', 'score'] as const).map((field) => {
                  const isActive = categorySortBy.startsWith(field);
                  const isDesc = categorySortBy === `${field}-desc`;
                  const DirectionIcon = isActive ? (isDesc ? ArrowDown : ArrowUp) : ArrowUpDown;
                  return (
                    <Button
                      key={field}
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        if (isActive) {
                          setCategorySortBy(`${field}-${isDesc ? 'asc' : 'desc'}` as typeof categorySortBy);
                        } else {
                          setCategorySortBy(`${field}-desc`);
                        }
                      }}
                    >
                      {field === 'weightage' ? 'Weightage' : 'Score'}
                      <DirectionIcon className="h-3 w-3" />
                    </Button>
                  );
                })}
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={[...categoryPerformance].sort((a, b) => {
                  if (categorySortBy === 'weightage-desc') return (b.weightage || 0) - (a.weightage || 0);
                  if (categorySortBy === 'weightage-asc') return (a.weightage || 0) - (b.weightage || 0);
                  if (categorySortBy === 'score-asc') return a.avgScore - b.avgScore;
                  return b.avgScore - a.avgScore;
                })} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={160}
                    interval={0}
                    tickFormatter={(value: string, index: number) => {
                      const sorted = [...categoryPerformance].sort((a, b) => {
                        if (categorySortBy === 'weightage-desc') return (b.weightage || 0) - (a.weightage || 0);
                        if (categorySortBy === 'weightage-asc') return (a.weightage || 0) - (b.weightage || 0);
                        if (categorySortBy === 'score-asc') return a.avgScore - b.avgScore;
                        return b.avgScore - a.avgScore;
                      });
                      const cat = sorted[index];
                      return cat?.weightage ? `${value} (${cat.weightage}%)` : value;
                    }}
                  />
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

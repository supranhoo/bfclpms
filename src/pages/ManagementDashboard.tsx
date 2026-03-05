import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useKpiFilters } from '@/hooks/useKpiFilters';
import { KpiFilterBar } from '@/components/ui/KpiFilterBar';
import { useRollbackStatusCounts } from '@/hooks/useAllRollbackRequests';
import { PerformanceTrendChart } from '@/components/management/PerformanceTrendChart';
import { RatingHistogram } from '@/components/management/RatingHistogram';
import { TopBottomPerformers } from '@/components/management/TopBottomPerformers';
import { ActionItemsCards } from '@/components/management/ActionItemsCards';
import { ReviewerAnalyticsTable } from '@/components/management/ReviewerAnalyticsTable';
import { TrainingGapSummary } from '@/components/management/TrainingGapSummary';
import { RecentAuditLog } from '@/components/management/RecentAuditLog';
import { NotificationsSummary } from '@/components/management/NotificationsSummary';
import {
  Users,
  Target,
  ClipboardCheck,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CheckCircle2,
  Shield,
  Briefcase,
  ArrowRight,
  Building2,
  BarChart3,
  Eye,
  Download,
  Award,
} from 'lucide-react';

interface DepartmentPerformance {
  department: string;
  totalEmployees: number;
  avgScore: number;
  completionRate: number;
  pendingReviews: number;
  riskFlags: number;
}

interface PendingReview {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  kpiCount: number;
  currentStage: string;
  avgScore: number;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const RATING_COLORS = {
  excellent: 'text-green-600 dark:text-green-400',
  good: 'text-blue-600 dark:text-blue-400',
  average: 'text-yellow-600 dark:text-yellow-400',
  poor: 'text-destructive',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  const {
    filters,
    updateFilter,
    resetFilters,
    divisions,
    businessUnits,
    departments,
    managers,
    employees,
    filteredEmployeeIds,
    isLoading: filtersLoading,
  } = useKpiFilters();

  const { data: rollbackCounts } = useRollbackStatusCounts();

  // Fetch review periods
  const { data: reviewPeriods } = useQuery({
    queryKey: ['review-periods', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('*')
        .eq('review_year', parseInt(selectedYear))
        .order('period_name');
      if (error) throw error;
      return data;
    },
  });

  // Helper to get previous period
  const getPreviousPeriod = (currentPeriod: string, periods: typeof reviewPeriods): string | null => {
    if (!periods || periods.length === 0) return null;
    const sortedPeriods = [...periods].sort((a, b) => a.period_name.localeCompare(b.period_name));
    const currentIndex = sortedPeriods.findIndex(p => p.period_name === currentPeriod);
    if (currentIndex > 0) return sortedPeriods[currentIndex - 1].period_name;
    return null;
  };

  const previousPeriod = selectedPeriod !== 'all' ? getPreviousPeriod(selectedPeriod, reviewPeriods || []) : null;

  // Main dashboard data query
  const { data: dashboardData, isLoading: dataLoading } = useQuery({
    queryKey: ['management-dashboard', selectedYear, selectedPeriod, filteredEmployeeIds, previousPeriod],
    queryFn: async () => {
      const year = parseInt(selectedYear);

      const fetchPeriodData = async (periodFilter: string | null) => {
        const allKpis: any[] = [];
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;
        while (hasMore) {
          let query = supabase
            .from('kpis')
            .select(`
              id, employee_id, status, weightage, review_period, review_year,
              review_submissions ( final_score, management_score, auditor_score, manager_score, self_score )
            `)
            .eq('review_year', year)
            .range(offset, offset + batchSize - 1);
          if (periodFilter && periodFilter !== 'all') query = query.eq('review_period', periodFilter);
          if (filteredEmployeeIds.length > 0) query = query.in('employee_id', filteredEmployeeIds);
          const { data, error } = await query;
          if (error) throw error;
          if (data && data.length > 0) { allKpis.push(...data); offset += batchSize; hasMore = data.length === batchSize; } else { hasMore = false; }
        }
        return allKpis;
      };

      const [currentKpis, previousKpis, profilesResult, queriesResult, departmentsResult] = await Promise.all([
        fetchPeriodData(selectedPeriod),
        previousPeriod ? fetchPeriodData(previousPeriod) : Promise.resolve([]),
        supabase.from('profiles').select('id, full_name, employee_code, department_id, reporting_manager_id, departments (name)'),
        supabase.from('kpi_queries').select('*', { count: 'exact', head: true }).eq('status', 'open').eq('query_type', 'query'),
        supabase.from('departments').select('id, name'),
      ]);

      const profiles = profilesResult.data || [];
      const kpis = currentKpis;
      const openQueries = queriesResult.count || 0;
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      // Get score for a KPI
      const getScore = (kpi: any) => {
        const s = kpi.review_submissions;
        return s?.final_score ?? s?.management_score ?? s?.auditor_score ?? s?.manager_score ?? s?.self_score ?? 0;
      };

      // Calculate metrics
      const calculateMetrics = (kpiList: any[]) => {
        const stageCounts: Record<string, number> = {};
        kpiList.forEach(kpi => { const stage = kpi.status || 'kra_set'; stageCounts[stage] = (stageCounts[stage] || 0) + 1; });
        const managementPending = kpiList.filter(k => k.status === 'management_review').length;
        const approvedKpis = stageCounts['approved'] || 0;
        const completionRate = kpiList.length > 0 ? (approvedKpis / kpiList.length) * 100 : 0;
        let totalScore = 0, totalWeightage = 0;
        kpiList.forEach(kpi => { totalScore += getScore(kpi); totalWeightage += kpi.weightage || 100; });
        const avgScore = totalWeightage > 0 ? (totalScore / totalWeightage) * 100 : 0;
        return { totalKpis: kpiList.length, managementPending, approvedKpis, completionRate, avgScore, stageCounts };
      };

      const currentMetrics = calculateMetrics(kpis);
      const previousMetrics = previousKpis.length > 0 ? calculateMetrics(previousKpis) : null;

      const calculateTrend = (current: number, previous: number | null): { change: number; direction: 'up' | 'down' | 'stable' } => {
        if (previous === null || previous === 0) return { change: 0, direction: 'stable' };
        const change = ((current - previous) / previous) * 100;
        if (change > 2) return { change, direction: 'up' };
        if (change < -2) return { change, direction: 'down' };
        return { change, direction: 'stable' };
      };

      const trends = {
        totalKpis: calculateTrend(currentMetrics.totalKpis, previousMetrics?.totalKpis ?? null),
        managementPending: calculateTrend(currentMetrics.managementPending, previousMetrics?.managementPending ?? null),
        completionRate: calculateTrend(currentMetrics.completionRate, previousMetrics?.completionRate ?? null),
        avgScore: calculateTrend(currentMetrics.avgScore, previousMetrics?.avgScore ?? null),
      };

      // Pending management reviews grouped by employee
      const managementPendingKpis = kpis.filter(k => k.status === 'management_review');
      const employeePendingMap = new Map<string, { kpiCount: number; totalScore: number; totalWeightage: number }>();
      managementPendingKpis.forEach(kpi => {
        const score = getScore(kpi);
        const w = kpi.weightage || 100;
        const existing = employeePendingMap.get(kpi.employee_id);
        if (existing) { existing.kpiCount++; existing.totalScore += score; existing.totalWeightage += w; }
        else employeePendingMap.set(kpi.employee_id, { kpiCount: 1, totalScore: score, totalWeightage: w });
      });

      const pendingReviews: PendingReview[] = Array.from(employeePendingMap.entries())
        .map(([eid, d]) => {
          const p = profileMap.get(eid);
          return { employeeId: eid, employeeName: p?.full_name || 'Unknown', employeeCode: p?.employee_code || '-', department: (p?.departments as any)?.name || '-', kpiCount: d.kpiCount, currentStage: 'management_review', avgScore: d.totalWeightage > 0 ? (d.totalScore / d.totalWeightage) * 100 : 0 };
        })
        .sort((a, b) => b.kpiCount - a.kpiCount);

      // Department performance with risk flags
      const deptStats = new Map<string, { employees: Set<string>; totalScore: number; totalWeightage: number; approvedKpis: number; totalKpis: number; pendingReviews: number; employeeScores: Map<string, { s: number; w: number }> }>();
      kpis.forEach(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const deptName = (profile?.departments as any)?.name || 'Unknown';
        if (!deptStats.has(deptName)) deptStats.set(deptName, { employees: new Set(), totalScore: 0, totalWeightage: 0, approvedKpis: 0, totalKpis: 0, pendingReviews: 0, employeeScores: new Map() });
        const stats = deptStats.get(deptName)!;
        stats.employees.add(kpi.employee_id);
        stats.totalKpis++;
        const score = getScore(kpi);
        stats.totalScore += score;
        stats.totalWeightage += kpi.weightage || 100;
        if (kpi.status === 'approved') stats.approvedKpis++;
        if (kpi.status === 'management_review') stats.pendingReviews++;
        // Per-employee scores for risk flags
        const es = stats.employeeScores.get(kpi.employee_id) || { s: 0, w: 0 };
        es.s += score; es.w += (kpi.weightage || 100);
        stats.employeeScores.set(kpi.employee_id, es);
      });

      const departmentPerformance: DepartmentPerformance[] = Array.from(deptStats.entries())
        .map(([department, stats]) => {
          let riskFlags = 0;
          stats.employeeScores.forEach(({ s, w }) => { if (w > 0 && (s / w) * 100 < 50) riskFlags++; });
          return { department, totalEmployees: stats.employees.size, avgScore: stats.totalWeightage > 0 ? (stats.totalScore / stats.totalWeightage) * 100 : 0, completionRate: stats.totalKpis > 0 ? (stats.approvedKpis / stats.totalKpis) * 100 : 0, pendingReviews: stats.pendingReviews, riskFlags };
        })
        .filter(d => d.department !== 'Unknown')
        .sort((a, b) => b.avgScore - a.avgScore);

      // Rating distribution
      const ratingCounts = { excellent: 0, good: 0, average: 0, poor: 0 };
      const employeeScoreMap = new Map<string, { total: number; weightage: number }>();
      kpis.forEach(kpi => {
        const score = getScore(kpi);
        const w = kpi.weightage || 100;
        const existing = employeeScoreMap.get(kpi.employee_id);
        if (existing) { existing.total += score; existing.weightage += w; }
        else employeeScoreMap.set(kpi.employee_id, { total: score, weightage: w });
      });
      employeeScoreMap.forEach(({ total, weightage }) => {
        const pct = weightage > 0 ? (total / weightage) * 100 : 0;
        if (pct >= 85) ratingCounts.excellent++;
        else if (pct >= 70) ratingCounts.good++;
        else if (pct >= 50) ratingCounts.average++;
        else ratingCounts.poor++;
      });

      // Top & Bottom performers
      const employeePerformers = Array.from(employeeScoreMap.entries()).map(([eid, { total, weightage }]) => {
        const p = profileMap.get(eid);
        return { employeeId: eid, name: p?.full_name || 'Unknown', department: (p?.departments as any)?.name || '-', score: weightage > 0 ? (total / weightage) * 100 : 0 };
      }).sort((a, b) => b.score - a.score);
      const topPerformers = employeePerformers.slice(0, 5);
      const bottomPerformers = [...employeePerformers].sort((a, b) => a.score - b.score).slice(0, 5);

      // Performance trend by period (for all months in year)
      const periodScores = new Map<string, { total: number; weightage: number }>();
      // Use ALL kpis for the year (not filtered by period) for trend
      const allYearKpis = selectedPeriod === 'all' ? kpis : currentKpis;
      // We need to fetch all year KPIs for trend — use currentKpis if 'all', else refetch
      kpis.forEach(kpi => {
        const period = kpi.review_period || 'Unknown';
        const score = getScore(kpi);
        const w = kpi.weightage || 100;
        const existing = periodScores.get(period);
        if (existing) { existing.total += score; existing.weightage += w; }
        else periodScores.set(period, { total: score, weightage: w });
      });
      const trendData = MONTHS
        .filter(m => periodScores.has(m))
        .map(m => ({ period: m, avgScore: periodScores.get(m)!.weightage > 0 ? (periodScores.get(m)!.total / periodScores.get(m)!.weightage) * 100 : 0 }));

      // Reviewer analytics — manager score bias
      const managerScores = new Map<string, { total: number; count: number }>();
      kpis.forEach(kpi => {
        const submission = kpi.review_submissions;
        const ms = submission?.manager_score;
        if (ms != null && ms > 0) {
          const profile = profileMap.get(kpi.employee_id);
          const managerId = profile?.reporting_manager_id;
          if (managerId) {
            const existing = managerScores.get(managerId);
            if (existing) { existing.total += ms; existing.count++; }
            else managerScores.set(managerId, { total: ms, count: 1 });
          }
        }
      });
      // Org mean of manager scores
      let totalMgrScore = 0, totalMgrCount = 0;
      managerScores.forEach(({ total, count }) => { totalMgrScore += total; totalMgrCount += count; });
      const orgMeanManagerScore = totalMgrCount > 0 ? (totalMgrScore / totalMgrCount) : 0;
      // Normalize to percentage (scores are typically 0-5)
      const orgMeanPct = orgMeanManagerScore * 20; // 5 -> 100%

      const reviewerAnalytics = Array.from(managerScores.entries())
        .filter(([_, d]) => d.count >= 3) // Only managers with 3+ reviews
        .map(([mid, d]) => {
          const mp = profileMap.get(mid);
          const avgPct = (d.total / d.count) * 20;
          return { managerId: mid, managerName: mp?.full_name || 'Unknown', avgScoreGiven: avgPct, deviation: avgPct - orgMeanPct, reviewCount: d.count };
        })
        .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
        .slice(0, 10);

      // Overdue reviews: KPIs in non-terminal stages updated > 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      // We can't filter by updated_at in our existing query, so approximate from what we have
      // Count KPIs stuck in intermediate stages  
      const overdueReviews = kpis.filter(k => 
        k.status && !['approved', 'kra_set'].includes(k.status)
      ).length;

      return {
        totalEmployees: profiles.length,
        employeesWithKpis: employeeScoreMap.size,
        totalKpis: kpis.length,
        openQueries,
        managementPending: currentMetrics.managementPending,
        approvedKpis: currentMetrics.approvedKpis,
        stageCounts: currentMetrics.stageCounts,
        pendingReviews: pendingReviews.slice(0, 10),
        departmentPerformance: departmentPerformance.slice(0, 10),
        ratingDistribution: [
          { name: 'Excellent (85%+)', value: ratingCounts.excellent, color: CHART_COLORS[0] },
          { name: 'Good (70-84%)', value: ratingCounts.good, color: CHART_COLORS[1] },
          { name: 'Average (50-69%)', value: ratingCounts.average, color: CHART_COLORS[2] },
          { name: 'Needs Improvement (<50%)', value: ratingCounts.poor, color: CHART_COLORS[3] },
        ],
        completionRate: currentMetrics.completionRate,
        avgScore: currentMetrics.avgScore,
        trends,
        hasPreviousPeriod: !!previousPeriod && previousKpis.length > 0,
        previousPeriodName: previousPeriod,
        topPerformers,
        bottomPerformers,
        trendData,
        reviewerAnalytics,
        orgMeanPct,
        overdueReviews,
      };
    },
  });

  // Trend indicator component
  const TrendIndicator = ({ trend, invertColors = false, showLabel = true }: { trend: { change: number; direction: 'up' | 'down' | 'stable' }; invertColors?: boolean; showLabel?: boolean }) => {
    if (!dashboardData?.hasPreviousPeriod) return null;
    const { change, direction } = trend;
    const isPositive = invertColors ? direction === 'down' : direction === 'up';
    if (direction === 'stable') return <div className="flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" />{showLabel && <span>Stable</span>}</div>;
    return (
      <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {direction === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {showLabel && <span>{Math.abs(change).toFixed(1)}%</span>}
      </div>
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const getScoreColor = (score: number) => {
    if (score >= 85) return RATING_COLORS.excellent;
    if (score >= 70) return RATING_COLORS.good;
    if (score >= 50) return RATING_COLORS.average;
    return RATING_COLORS.poor;
  };

  // PDF Export
  const handleExport = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.text('Management Dashboard Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Year: ${selectedYear} | Period: ${selectedPeriod === 'all' ? 'All' : selectedPeriod}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 36);

    // Summary stats
    doc.setFontSize(12);
    doc.text('Key Metrics', 14, 46);
    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Employees (KPI Coverage)', `${dashboardData?.employeesWithKpis || 0} / ${dashboardData?.totalEmployees || 0}`],
        ['Total KPIs', String(dashboardData?.totalKpis || 0)],
        ['Completion Rate', `${(dashboardData?.completionRate || 0).toFixed(1)}%`],
        ['Avg Score', `${(dashboardData?.avgScore || 0).toFixed(1)}%`],
        ['Pending Reviews', String(dashboardData?.managementPending || 0)],
        ['Open Queries', String(dashboardData?.openQueries || 0)],
      ],
    });

    // Department table
    if (dashboardData?.departmentPerformance?.length) {
      const lastY = (doc as any).lastAutoTable?.finalY || 100;
      doc.text('Department Performance', 14, lastY + 10);
      autoTable(doc, {
        startY: lastY + 14,
        head: [['Department', 'Employees', 'Avg Score', 'Completion', 'Risk Flags']],
        body: dashboardData.departmentPerformance.map(d => [
          d.department, String(d.totalEmployees), `${d.avgScore.toFixed(1)}%`, `${d.completionRate.toFixed(0)}%`, String(d.riskFlags),
        ]),
      });
    }

    doc.save(`management-dashboard-${selectedYear}-${selectedPeriod}.pdf`);
  };

  const isLoading = filtersLoading || dataLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Management Dashboard" description="Executive overview of organizational performance" backTo="/dashboard" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <PageHeader
        title="Management Dashboard"
        description="Executive overview of organizational performance"
        backTo="/dashboard"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export Report
            </Button>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Periods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {reviewPeriods?.map(period => <SelectItem key={period.id} value={period.period_name}>{period.period_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <KpiFilterBar
            filters={filters} updateFilter={updateFilter} resetFilters={resetFilters}
            divisions={divisions} businessUnits={businessUnits} departments={departments}
            managers={managers} employees={employees} showCategoryFilter={false} showStatusFilter={false} isLoading={filtersLoading}
          />
        </CardContent>
      </Card>

      {/* Trend Info Banner */}
      {dashboardData?.hasPreviousPeriod && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <TrendingUp className="h-3 w-3" />
          <span>Comparing with previous period: <span className="font-medium">{dashboardData.previousPeriodName}</span></span>
        </div>
      )}

      {/* KPI Snapshot Cards — now 5 with Avg Score */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/reports/employee-summary')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.employeesWithKpis || 0} / {dashboardData?.totalEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">KPIs assigned / Total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Score</CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(dashboardData?.avgScore || 0)}`}>
                {(dashboardData?.avgScore || 0).toFixed(1)}%
              </span>
              {dashboardData?.trends && <TrendIndicator trend={dashboardData.trends.avgScore} />}
            </div>
            <p className="text-xs text-muted-foreground">Weighted average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-chart-2">{(dashboardData?.completionRate || 0).toFixed(1)}%</span>
              {dashboardData?.trends && <TrendIndicator trend={dashboardData.trends.completionRate} />}
            </div>
            <Progress value={dashboardData?.completionRate || 0} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/management-review')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <Briefcase className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-chart-4">{dashboardData?.managementPending || 0}</span>
              {dashboardData?.trends && <TrendIndicator trend={dashboardData.trends.managementPending} invertColors />}
            </div>
            <p className="text-xs text-muted-foreground">KPIs awaiting action</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/reports/queries')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Queries</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{dashboardData?.openQueries || 0}</div>
            <p className="text-xs text-muted-foreground">Need resolution</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Trend + Rating Histogram */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PerformanceTrendChart data={dashboardData?.trendData || []} />
        <RatingHistogram data={dashboardData?.ratingDistribution || []} />
      </div>

      {/* Department Performance Table with Risk Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Department Performance
          </CardTitle>
          <CardDescription>Completion rates, scores, and risk flags by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead className="text-center">Risk Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dashboardData?.departmentPerformance || []).map((dept) => (
                  <TableRow key={dept.department} className={dept.riskFlags > 2 ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">{dept.department}</TableCell>
                    <TableCell className="text-center">{dept.totalEmployees}</TableCell>
                    <TableCell className="text-right">
                      <span className={getScoreColor(dept.avgScore)}>{dept.avgScore.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={dept.completionRate} className="w-16 h-2" />
                        <span className="text-sm w-12 text-right">{dept.completionRate.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {dept.riskFlags > 0 ? (
                        <Badge variant={dept.riskFlags > 2 ? 'destructive' : 'secondary'}>
                          {dept.riskFlags}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Top & Bottom Performers */}
      <TopBottomPerformers
        top={dashboardData?.topPerformers || []}
        bottom={dashboardData?.bottomPerformers || []}
      />

      {/* Action Items & Approvals */}
      <ActionItemsCards
        overdueReviews={dashboardData?.overdueReviews || 0}
        pendingRollbacks={rollbackCounts?.pending || 0}
        openQueries={dashboardData?.openQueries || 0}
      />

      {/* Pending Management Reviews Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Pending Management Reviews
            </CardTitle>
            <CardDescription>Employees awaiting your review</CardDescription>
          </div>
          <Button onClick={() => navigate('/management-review')}>
            Review All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {(dashboardData?.pendingReviews?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No pending reviews! All caught up.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">KPIs</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData?.pendingReviews?.map((review) => (
                    <TableRow key={review.employeeId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{review.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{review.employeeCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>{review.department}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{review.kpiCount}</Badge></TableCell>
                      <TableCell className="text-right">
                        <span className={getScoreColor(review.avgScore)}>{review.avgScore.toFixed(1)}%</span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/management-review')}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reviewer Analytics + Training Gap */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewerAnalyticsTable
          data={dashboardData?.reviewerAnalytics || []}
          orgMean={dashboardData?.orgMeanPct || 0}
        />
        <TrainingGapSummary
          reviewPeriod={selectedPeriod !== 'all' ? selectedPeriod : undefined}
          reviewYear={parseInt(selectedYear)}
        />
      </div>

      {/* Audit Log + Notifications */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentAuditLog />
        <NotificationsSummary />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common management tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Review KPIs', icon: Briefcase, to: '/management-review' },
              { label: 'Employee Summary', icon: Users, to: '/reports/employee-summary' },
              { label: 'Department Report', icon: Building2, to: '/reports/department' },
              { label: 'All Reports', icon: BarChart3, to: '/reports' },
            ].map((action) => (
              <Button key={action.label} variant="outline" className="justify-between h-auto py-3" onClick={() => navigate(action.to)}>
                <div className="flex items-center gap-2">
                  <action.icon className="h-4 w-4" />
                  <span>{action.label}</span>
                </div>
                <ArrowRight className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

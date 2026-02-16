import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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
  Eye
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

interface DepartmentPerformance {
  department: string;
  totalEmployees: number;
  avgScore: number;
  completionRate: number;
  pendingReviews: number;
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

const STAGE_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  kra_set: { label: 'KRA Set', icon: Target, color: 'bg-muted text-muted-foreground' },
  self_review: { label: 'Self Review', icon: Clock, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  manager_check: { label: 'Manager Check', icon: Users, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  audit: { label: 'Audit', icon: Shield, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  management_review: { label: 'Management Review', icon: Briefcase, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
};

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

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  // Use the KPI filters hook for hierarchical filtering
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
    if (currentIndex > 0) {
      return sortedPeriods[currentIndex - 1].period_name;
    }
    return null;
  };

  const previousPeriod = selectedPeriod !== 'all' ? getPreviousPeriod(selectedPeriod, reviewPeriods || []) : null;

  // Fetch comprehensive dashboard stats with trend comparison
  const { data: dashboardData, isLoading: dataLoading } = useQuery({
    queryKey: ['management-dashboard', selectedYear, selectedPeriod, filteredEmployeeIds, previousPeriod],
    queryFn: async () => {
      const year = parseInt(selectedYear);

      // Helper function to fetch period data
      const fetchPeriodData = async (periodFilter: string | null) => {
        const allKpis: any[] = [];
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from('kpis')
            .select(`
              id,
              employee_id,
              status,
              weightage,
              review_period,
              review_year,
              review_submissions (
                final_score,
                management_score,
                auditor_score,
                manager_score,
                self_score
              )
            `)
            .eq('review_year', year)
            .range(offset, offset + batchSize - 1);

          if (periodFilter && periodFilter !== 'all') {
            query = query.eq('review_period', periodFilter);
          }

          if (filteredEmployeeIds.length > 0) {
            query = query.in('employee_id', filteredEmployeeIds);
          }

          const { data, error } = await query;
          if (error) throw error;

          if (data && data.length > 0) {
            allKpis.push(...data);
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }
        return allKpis;
      };

      // Fetch current and previous period data in parallel
      const [currentKpis, previousKpis, profilesResult, queriesResult, previousQueriesResult, departmentsResult] = await Promise.all([
        fetchPeriodData(selectedPeriod),
        previousPeriod ? fetchPeriodData(previousPeriod) : Promise.resolve([]),
        supabase.from('profiles').select(`
          id,
          full_name,
          employee_code,
          department_id,
          departments (name)
        `),
        supabase.from('kpi_queries').select('*', { count: 'exact', head: true }).eq('status', 'open').eq('query_type', 'query'),
        previousPeriod 
          ? supabase.from('kpi_queries').select('*', { count: 'exact', head: true }).eq('status', 'resolved')
          : Promise.resolve({ count: 0 }),
        supabase.from('departments').select('id, name'),
      ]);

      const profiles = profilesResult.data || [];
      const kpis = currentKpis;
      const openQueries = queriesResult.count || 0;
      const departments = departmentsResult.data || [];

      // Create lookups
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      // Calculate metrics for current period
      const calculateMetrics = (kpiList: any[]) => {
        const stageCounts: Record<string, number> = {};
        kpiList.forEach(kpi => {
          const stage = kpi.status || 'kra_set';
          stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        });

        const managementPending = kpiList.filter(k => k.status === 'management_review').length;
        const approvedKpis = stageCounts['approved'] || 0;
        const completionRate = kpiList.length > 0 ? (approvedKpis / kpiList.length) * 100 : 0;

        // Calculate average score
        let totalScore = 0;
        let totalWeightage = 0;
        kpiList.forEach(kpi => {
          const submission = kpi.review_submissions;
          const score = submission?.final_score ?? submission?.management_score ?? 
                       submission?.auditor_score ?? submission?.manager_score ?? 
                       submission?.self_score ?? 0;
          totalScore += score;
          totalWeightage += kpi.weightage || 100;
        });
        const avgScore = totalWeightage > 0 ? (totalScore / totalWeightage) * 100 : 0;

        return {
          totalKpis: kpiList.length,
          managementPending,
          approvedKpis,
          completionRate,
          avgScore,
          stageCounts,
        };
      };

      const currentMetrics = calculateMetrics(kpis);
      const previousMetrics = previousKpis.length > 0 ? calculateMetrics(previousKpis) : null;

      // Calculate trends
      const calculateTrend = (current: number, previous: number | null): { change: number; direction: 'up' | 'down' | 'stable' } => {
        if (previous === null || previous === 0) {
          return { change: 0, direction: 'stable' };
        }
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

      // Calculate pending management reviews
      const managementPendingKpis = kpis.filter(k => k.status === 'management_review');
      
      // Group by employee for pending reviews
      const employeePendingMap = new Map<string, {
        kpiCount: number;
        totalScore: number;
        totalWeightage: number;
        status: string;
      }>();

      managementPendingKpis.forEach(kpi => {
        const existing = employeePendingMap.get(kpi.employee_id);
        const submission = kpi.review_submissions;
        const score = submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? 0;
        const weightage = kpi.weightage || 100;

        if (existing) {
          existing.kpiCount += 1;
          existing.totalScore += score;
          existing.totalWeightage += weightage;
        } else {
          employeePendingMap.set(kpi.employee_id, {
            kpiCount: 1,
            totalScore: score,
            totalWeightage: weightage,
            status: 'management_review',
          });
        }
      });

      const pendingReviews: PendingReview[] = Array.from(employeePendingMap.entries())
        .map(([employeeId, data]) => {
          const profile = profileMap.get(employeeId);
          return {
            employeeId,
            employeeName: profile?.full_name || 'Unknown',
            employeeCode: profile?.employee_code || '-',
            department: (profile?.departments as any)?.name || '-',
            kpiCount: data.kpiCount,
            currentStage: data.status,
            avgScore: data.totalWeightage > 0 ? (data.totalScore / data.totalWeightage) * 100 : 0,
          };
        })
        .sort((a, b) => b.kpiCount - a.kpiCount);

      // Calculate department performance
      const deptStats = new Map<string, {
        employees: Set<string>;
        totalScore: number;
        totalWeightage: number;
        approvedKpis: number;
        totalKpis: number;
        pendingReviews: number;
      }>();

      kpis.forEach(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const deptName = (profile?.departments as any)?.name || 'Unknown';

        if (!deptStats.has(deptName)) {
          deptStats.set(deptName, {
            employees: new Set(),
            totalScore: 0,
            totalWeightage: 0,
            approvedKpis: 0,
            totalKpis: 0,
            pendingReviews: 0,
          });
        }

        const stats = deptStats.get(deptName)!;
        stats.employees.add(kpi.employee_id);
        stats.totalKpis += 1;

        const submission = kpi.review_submissions;
        const score = submission?.final_score ?? submission?.management_score ?? 
                     submission?.auditor_score ?? submission?.manager_score ?? 
                     submission?.self_score ?? 0;
        stats.totalScore += score;
        stats.totalWeightage += kpi.weightage || 100;

        if (kpi.status === 'approved') {
          stats.approvedKpis += 1;
        }
        if (kpi.status === 'management_review') {
          stats.pendingReviews += 1;
        }
      });

      const departmentPerformance: DepartmentPerformance[] = Array.from(deptStats.entries())
        .map(([department, stats]) => ({
          department,
          totalEmployees: stats.employees.size,
          avgScore: stats.totalWeightage > 0 ? (stats.totalScore / stats.totalWeightage) * 100 : 0,
          completionRate: stats.totalKpis > 0 ? (stats.approvedKpis / stats.totalKpis) * 100 : 0,
          pendingReviews: stats.pendingReviews,
        }))
        .filter(d => d.department !== 'Unknown')
        .sort((a, b) => b.avgScore - a.avgScore);

      // Rating distribution
      const ratingCounts = { excellent: 0, good: 0, average: 0, poor: 0 };
      const employeeScores = new Map<string, { total: number; weightage: number }>();

      kpis.forEach(kpi => {
        const submission = kpi.review_submissions;
        const score = submission?.final_score || submission?.management_score || 0;
        const weightage = kpi.weightage || 100;

        const existing = employeeScores.get(kpi.employee_id);
        if (existing) {
          existing.total += score;
          existing.weightage += weightage;
        } else {
          employeeScores.set(kpi.employee_id, { total: score, weightage });
        }
      });

      employeeScores.forEach(({ total, weightage }) => {
        const percentage = weightage > 0 ? (total / weightage) * 100 : 0;
        if (percentage >= 85) ratingCounts.excellent += 1;
        else if (percentage >= 70) ratingCounts.good += 1;
        else if (percentage >= 50) ratingCounts.average += 1;
        else ratingCounts.poor += 1;
      });

      return {
        totalEmployees: profiles.length,
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
      };
    },
  });

  // Trend indicator component
  const TrendIndicator = ({ 
    trend, 
    invertColors = false,
    showLabel = true 
  }: { 
    trend: { change: number; direction: 'up' | 'down' | 'stable' };
    invertColors?: boolean;
    showLabel?: boolean;
  }) => {
    if (!dashboardData?.hasPreviousPeriod) return null;

    const { change, direction } = trend;
    
    // For some metrics like "pending", down is good
    const isPositive = invertColors ? direction === 'down' : direction === 'up';
    const isNegative = invertColors ? direction === 'up' : direction === 'down';

    if (direction === 'stable') {
      return (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="h-3 w-3" />
          {showLabel && <span>Stable</span>}
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-1 text-xs ${
        isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}>
        {direction === 'up' ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {showLabel && (
          <span>{Math.abs(change).toFixed(1)}%</span>
        )}
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

  const isLoading = filtersLoading || dataLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Management Dashboard"
          description="Executive overview of organizational performance"
          backTo="/dashboard"
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Management Dashboard"
        description="Executive overview of organizational performance"
        backTo="/dashboard"
        actions={
          <div className="flex gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {reviewPeriods?.map(period => (
                  <SelectItem key={period.id} value={period.period_name}>
                    {period.period_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Hierarchical Filters */}
      <Card>
        <CardContent className="pt-6">
          <KpiFilterBar
            filters={filters}
            updateFilter={updateFilter}
            resetFilters={resetFilters}
            divisions={divisions}
            businessUnits={businessUnits}
            departments={departments}
            managers={managers}
            employees={employees}
            showCategoryFilter={false}
            showStatusFilter={false}
            isLoading={filtersLoading}
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

      {/* Key Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/reports/employee-summary')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData?.totalEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">In the system</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/management-review')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending My Review</CardTitle>
            <Briefcase className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-chart-4">{dashboardData?.managementPending || 0}</span>
              {dashboardData?.trends && (
                <TrendIndicator trend={dashboardData.trends.managementPending} invertColors />
              )}
            </div>
            <p className="text-xs text-muted-foreground">KPIs awaiting action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completion Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-chart-2">
                {(dashboardData?.completionRate || 0).toFixed(1)}%
              </span>
              {dashboardData?.trends && (
                <TrendIndicator trend={dashboardData.trends.completionRate} />
              )}
            </div>
            <Progress 
              value={dashboardData?.completionRate || 0} 
              className="mt-2 h-2" 
            />
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total KPIs</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{dashboardData?.totalKpis || 0}</span>
              {dashboardData?.trends && (
                <TrendIndicator trend={dashboardData.trends.totalKpis} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardData?.approvedKpis || 0} approved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rating Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Rating Distribution
            </CardTitle>
            <CardDescription>Employee performance by rating bands</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboardData?.ratingDistribution || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {(dashboardData?.ratingDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {(dashboardData?.ratingDistribution || []).map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">{item.name}:</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Department Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Department Performance
            </CardTitle>
            <CardDescription>Average scores by department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboardData?.departmentPerformance?.slice(0, 6) || []}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis 
                    type="category" 
                    dataKey="department" 
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Avg Score']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar 
                    dataKey="avgScore" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Reviews Table */}
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
            Review All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {(dashboardData?.pendingReviews?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No pending reviews! All caught up.</p>
            </div>
          ) : (
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
                    <TableCell className="text-center">
                      <Badge variant="secondary">{review.kpiCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={getScoreColor(review.avgScore)}>
                        {review.avgScore.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate('/management-review')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Department Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Department Overview
          </CardTitle>
          <CardDescription>Completion rates and performance metrics by department</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Employees</TableHead>
                <TableHead className="text-center">Pending Reviews</TableHead>
                <TableHead className="text-right">Avg Score</TableHead>
                <TableHead className="text-right">Completion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dashboardData?.departmentPerformance || []).map((dept) => (
                <TableRow key={dept.department}>
                  <TableCell className="font-medium">{dept.department}</TableCell>
                  <TableCell className="text-center">{dept.totalEmployees}</TableCell>
                  <TableCell className="text-center">
                    {dept.pendingReviews > 0 ? (
                      <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                        {dept.pendingReviews}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={getScoreColor(dept.avgScore)}>
                      {dept.avgScore.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress 
                        value={dept.completionRate} 
                        className="w-16 h-2" 
                      />
                      <span className="text-sm w-12 text-right">
                        {dept.completionRate.toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common management tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/management-review')}
            >
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                <span>Review KPIs</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/reports/employee-summary')}
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>Employee Summary</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/reports/department')}
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>Department Report</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="justify-between h-auto py-3"
              onClick={() => navigate('/reports')}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span>All Reports</span>
              </div>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

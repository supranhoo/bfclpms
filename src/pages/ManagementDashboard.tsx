import { useState, useMemo, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
import { getKpiDueDate } from '@/lib/frequencyUtils';
import { KpiFilterBar } from '@/components/ui/KpiFilterBar';
import { useRollbackStatusCounts } from '@/hooks/useAllRollbackRequests';
import { usePendingAdjustmentCount } from '@/hooks/useIncentiveRecords';
import { PerformanceTrendChart } from '@/components/management/PerformanceTrendChart';
import { RatingBellCurve } from '@/components/management/RatingBellCurve';
import { TopBottomPerformers } from '@/components/management/TopBottomPerformers';
import { ActionItemsCards } from '@/components/management/ActionItemsCards';
import { ReviewerAnalyticsTable } from '@/components/management/ReviewerAnalyticsTable';
import { TrainingGapSummary } from '@/components/management/TrainingGapSummary';
import { ManagerReviewDeviationTable } from '@/components/management/ManagerReviewDeviationTable';
import { RecentAuditLog } from '@/components/management/RecentAuditLog';
import { ReviewPeriodStatusWidget } from '@/components/management/ReviewPeriodStatusWidget';
import { DirectReporteesMonitor } from '@/components/management/DirectReporteesMonitor';
import { NotificationsSummary } from '@/components/management/NotificationsSummary';
import { Toggle } from '@/components/ui/toggle';
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

interface DivisionPerformance {
  division: string;
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

/** Fiscal year order: Jul → Jun */
const FISCAL_MONTHS = [
  'July', 'August', 'September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May', 'June'
];

const FISCAL_MONTHS_SHORT = FISCAL_MONTHS.map(m => m.substring(0, 3));

/**
 * For a fiscal year starting in `startYear`, returns {month, calendarYear} pairs
 * for the selected months.
 */
function getFiscalPeriodRanges(fiscalStartYear: number, selectedMonths: string[]): Array<{ month: string; year: number }> {
  return selectedMonths.map(month => {
    const monthIndex = MONTHS.indexOf(month);
    // Jul-Dec belong to the start year, Jan-Jun belong to the next year
    const calendarYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
    return { month, year: calendarYear };
  });
}

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  // Default fiscal year: if we're in Jul+ use current year, else previous year
  const defaultFiscalYear = currentMonth >= 6 ? currentYear : currentYear - 1;
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(defaultFiscalYear);
  const [selectedMonths, setSelectedMonths] = useState<string[]>(FISCAL_MONTHS);
  const { data: pendingAdjustments = 0 } = usePendingAdjustmentCount();

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

  // rollbackCounts already declared below

  // Compute fiscal period ranges for the query
  const fiscalPeriodRanges = useMemo(() => getFiscalPeriodRanges(selectedFiscalYear, selectedMonths), [selectedFiscalYear, selectedMonths]);
  const isSingleMonth = selectedMonths.length === 1;
  const fiscalYearLabel = `FY ${selectedFiscalYear}-${(selectedFiscalYear + 1).toString().slice(-2)}`;

  // Toggle month selection
  const toggleMonth = useCallback((month: string) => {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        // Don't allow deselecting all
        if (prev.length === 1) return prev;
        return prev.filter(m => m !== month);
      }
      return [...prev, month];
    });
  }, []);

  const selectAllMonths = useCallback(() => setSelectedMonths(FISCAL_MONTHS), []);

  const { data: rollbackCounts } = useRollbackStatusCounts();

  // Main dashboard data query
  const stableEmployeeKey = filteredEmployeeIds.join(',');
  const { data: dashboardData, isLoading: dataLoading, isError, refetch } = useQuery({
    queryKey: ['management-dashboard', selectedFiscalYear, selectedMonths, stableEmployeeKey, filters.divisionId, filters.businessUnitId, filters.departmentId, filters.managerId, filters.employeeId],
    placeholderData: keepPreviousData,
    queryFn: async () => {
     try {
      // Detect if any hierarchy filter is active to avoid .in() overflow with 454+ UUIDs
      const hasActiveHierarchyFilters = !!(filters.divisionId || filters.businessUnitId || filters.departmentId || filters.managerId || filters.employeeId);

      // Group selected months by calendar year for efficient querying
      const monthsByYear = new Map<number, string[]>();
      fiscalPeriodRanges.forEach(({ month, year }) => {
        if (!monthsByYear.has(year)) monthsByYear.set(year, []);
        monthsByYear.get(year)!.push(month);
      });

      const fetchFiscalData = async (): Promise<any[]> => {
        const allKpis: any[] = [];
        // Fetch calendar year chunks in parallel
        const yearResults = await Promise.all(
          Array.from(monthsByYear.entries()).map(async ([calYear, months]) => {
            const yearKpis: any[] = [];
            let offset = 0;
            const batchSize = 1000;
            let hasMore = true;
            while (hasMore) {
              let query = supabase
                .from('kpis')
                .select(`
                  id, employee_id, status, weightage, review_period, review_year, frequency,
                  review_submissions ( final_score, management_score, auditor_score, hr_pms_score, skip_level_score, manager_score, self_score, is_na )
                `)
                .eq('review_year', calYear)
                .in('review_period', months)
                .range(offset, offset + batchSize - 1);
              if (hasActiveHierarchyFilters) {
                if (filteredEmployeeIds.length === 0) { hasMore = false; continue; }
                query = query.in('employee_id', filteredEmployeeIds);
              }
              const { data, error } = await query;
              if (error) throw error;
              if (data && data.length > 0) { yearKpis.push(...data); offset += batchSize; hasMore = data.length === batchSize; } else { hasMore = false; }
            }
            return yearKpis;
          })
        );
        return yearResults.flat();
      };

      const [currentKpis, profilesResult, openQueryResult] = await Promise.all([
        fetchFiscalData(),
        supabase.from('profiles').select('id, full_name, employee_code, department_id, reporting_manager_id, departments (name, business_unit_id, business_units (name, division_id, divisions (name)))'),
        supabase.from('kpi_queries').select('kpi_id').eq('status', 'open').eq('query_type', 'query'),
      ]);

      const profiles = profilesResult.data || [];
      const kpis = currentKpis;
      // Filter open queries to only those linked to KPIs in the selected period
      const kpiIdSet = new Set(kpis.map((k: any) => k.id));
      const openQueries = (openQueryResult.data || []).filter((q: any) => kpiIdSet.has(q.kpi_id)).length;
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      const getScore = (kpi: any): number | null => {
        // PostgREST returns one-to-many embeds as arrays. Normalize to a
        // single submission row (there's at most one per KPI in practice).
        const raw = kpi.review_submissions;
        const s = Array.isArray(raw) ? raw[0] : raw;
        if (!s || s.is_na) return null;
        const score = (kpi.status === 'approved' ? s.final_score : null) ?? s.management_score ?? s.auditor_score 
          ?? s.hr_pms_score ?? s.skip_level_score 
          ?? s.manager_score ?? s.self_score ?? null;
        return score;
      };

      /** Returns numeric score or 0 for backward compat in metrics */
      const getScoreOrZero = (kpi: any): number => getScore(kpi) ?? 0;

      // Calculate metrics
      const calculateMetrics = (kpiList: any[]) => {
        const stageCounts: Record<string, number> = {};
        kpiList.forEach(kpi => { const stage = kpi.status || 'kra_set'; stageCounts[stage] = (stageCounts[stage] || 0) + 1; });
        const today = new Date();
        const isOverdue = (kpi: any) => {
          if (kpi.status === 'approved' || kpi.status === 'kra_set') return false;
          const dueDate = getKpiDueDate(kpi.frequency, kpi.review_period, kpi.review_year);
          if (!dueDate) return true;
          return today >= dueDate;
        };
        const managementPending = kpiList.filter(k => k.status === 'management_review' && isOverdue(k)).length;
        const approvedKpis = stageCounts['approved'] || 0;
        const completionRate = kpiList.length > 0 ? (approvedKpis / kpiList.length) * 100 : 0;
        let totalScore = 0, totalWeightage = 0;
        kpiList.forEach(kpi => {
          const s = getScore(kpi);
          if (s !== null) {
            const w = kpi.weightage ?? 100;
            totalScore += s * w;
            totalWeightage += w;
          }
        });
        const avgScore = totalWeightage > 0 ? (totalScore / totalWeightage) : 0;
        return { totalKpis: kpiList.length, managementPending, approvedKpis, completionRate, avgScore, stageCounts };
      };

      const currentMetrics = calculateMetrics(kpis);
      // No previous period comparison in multi-month mode
      const previousMetrics = null;

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
      const overdueToday = new Date();
      const isKpiOverdue = (kpi: any) => {
        const dueDate = getKpiDueDate(kpi.frequency, kpi.review_period, kpi.review_year);
        if (!dueDate) return true;
        return overdueToday >= dueDate;
      };
      const managementPendingKpis = kpis.filter(k => k.status === 'management_review' && isKpiOverdue(k));
      const employeePendingMap = new Map<string, { kpiCount: number; totalScore: number; totalWeightage: number }>();
      managementPendingKpis.forEach(kpi => {
        const score = getScoreOrZero(kpi);
        const w = kpi.weightage ?? 100;
        const existing = employeePendingMap.get(kpi.employee_id);
        if (existing) { existing.kpiCount++; existing.totalScore += score * w; existing.totalWeightage += w; }
        else employeePendingMap.set(kpi.employee_id, { kpiCount: 1, totalScore: score * w, totalWeightage: w });
      });

      const pendingReviews: PendingReview[] = Array.from(employeePendingMap.entries())
        .map(([eid, d]) => {
          const p = profileMap.get(eid);
          return { employeeId: eid, employeeName: p?.full_name || 'Unknown', employeeCode: p?.employee_code || '-', department: (p?.departments as any)?.name || '-', kpiCount: d.kpiCount, currentStage: 'management_review', avgScore: d.totalWeightage > 0 ? (d.totalScore / d.totalWeightage) : 0 };
        })
        .sort((a, b) => b.kpiCount - a.kpiCount);

      // Division performance with risk flags (department → business_unit → division)
      const divisionStats = new Map<string, { employees: Set<string>; totalScore: number; totalWeightage: number; approvedKpis: number; totalKpis: number; pendingReviews: number; employeeScores: Map<string, { s: number; w: number }> }>();
      kpis.forEach(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const dept = profile?.departments as any;
        const divisionName = dept?.business_units?.divisions?.name || dept?.business_units?.name || dept?.name || 'Unknown';
        if (!divisionStats.has(divisionName)) divisionStats.set(divisionName, { employees: new Set(), totalScore: 0, totalWeightage: 0, approvedKpis: 0, totalKpis: 0, pendingReviews: 0, employeeScores: new Map() });
        const stats = divisionStats.get(divisionName)!;
        stats.employees.add(kpi.employee_id);
        stats.totalKpis++;
        const score = getScoreOrZero(kpi);
        const w = kpi.weightage ?? 100;
        stats.totalScore += score * w;
        stats.totalWeightage += w;
        if (kpi.status === 'approved') stats.approvedKpis++;
        if (kpi.status === 'management_review' && isKpiOverdue(kpi)) stats.pendingReviews++;
        const es = stats.employeeScores.get(kpi.employee_id) || { s: 0, w: 0 };
        es.s += score * w; es.w += (kpi.weightage ?? 100);
        stats.employeeScores.set(kpi.employee_id, es);
      });

      const divisionPerformance: DivisionPerformance[] = Array.from(divisionStats.entries())
        .map(([division, stats]) => {
          let riskFlags = 0;
          stats.employeeScores.forEach(({ s, w }) => { if (w > 0 && (s / w) < 2.5) riskFlags++; });
          return { division, totalEmployees: stats.employees.size, avgScore: stats.totalWeightage > 0 ? (stats.totalScore / stats.totalWeightage) : 0, completionRate: stats.totalKpis > 0 ? (stats.approvedKpis / stats.totalKpis) * 100 : 0, pendingReviews: stats.pendingReviews, riskFlags };
        })
        .filter(d => d.division !== 'Unknown')
        .sort((a, b) => b.avgScore - a.avgScore);

      // Rating distribution
      const ratingCounts = { band5: 0, band4: 0, band3: 0, band2: 0, band1: 0 };
      const employeeScoreMap = new Map<string, { total: number; count: number; weightage: number }>();
      kpis.forEach(kpi => {
        if (kpi.status !== 'approved') return;
        const s = getScore(kpi);
        if (s === null) return;
        const w = kpi.weightage ?? 100;
        const existing = employeeScoreMap.get(kpi.employee_id);
        if (existing) { existing.total += s * w; existing.count++; existing.weightage += w; }
        else employeeScoreMap.set(kpi.employee_id, { total: s * w, count: 1, weightage: w });
      });
      employeeScoreMap.forEach(({ total, weightage }) => {
        const avgScore = weightage > 0 ? total / weightage : 0;
        const rounded = Math.round(Math.min(5, Math.max(0, avgScore)));
        if (rounded >= 5) ratingCounts.band5++;
        else if (rounded >= 4) ratingCounts.band4++;
        else if (rounded >= 3) ratingCounts.band3++;
        else if (rounded >= 2) ratingCounts.band2++;
        else ratingCounts.band1++;
      });

      // Compute mean and standard deviation using weighted averages
      const allAvgScores: number[] = [];
      employeeScoreMap.forEach(({ total, weightage }) => {
        if (weightage > 0) allAvgScores.push(total / weightage);
      });
      const meanScore = allAvgScores.length > 0 ? allAvgScores.reduce((a, b) => a + b, 0) / allAvgScores.length : 0;
      const stdDev = allAvgScores.length > 0 ? Math.sqrt(allAvgScores.reduce((sq, n) => sq + Math.pow(n - meanScore, 2), 0) / allAvgScores.length) : 0;

      // Top & Bottom performers — score on 0-5 scale (no * 100)
      const employeePerformers = Array.from(employeeScoreMap.entries()).map(([eid, { total, weightage }]) => {
        const p = profileMap.get(eid);
        return { employeeId: eid, name: p?.full_name || 'Unknown', department: (p?.departments as any)?.name || '-', score: weightage > 0 ? (total / weightage) : 0 };
      }).sort((a, b) => b.score - a.score);
      const topPerformers = employeePerformers.slice(0, 10);

      // Bottom performers: last 3 months with actual data, weighted average
      const monthsWithScores = new Set<string>();
      kpis.forEach(kpi => {
        if (getScore(kpi) !== null && kpi.review_period) monthsWithScores.add(kpi.review_period);
      });
      const recentMonthsForBottom = FISCAL_MONTHS
        .filter(m => selectedMonths.includes(m) && monthsWithScores.has(m))
        .slice(-3);
      
      const bottomEmployeeScores = new Map<string, { total: number; weightage: number }>();
      kpis.forEach(kpi => {
        if (kpi.status !== 'approved') return;
        if (!recentMonthsForBottom.includes(kpi.review_period)) return;
        const score = getScore(kpi);
        if (score === null) return;
        const w = kpi.weightage || 100;
        const existing = bottomEmployeeScores.get(kpi.employee_id);
        if (existing) { existing.total += score * w; existing.weightage += w; }
        else bottomEmployeeScores.set(kpi.employee_id, { total: score * w, weightage: w });
      });
      const bottomPerformers = Array.from(bottomEmployeeScores.entries())
        .map(([eid, { total, weightage }]) => {
          const p = profileMap.get(eid);
          return { employeeId: eid, name: p?.full_name || 'Unknown', department: (p?.departments as any)?.name || '-', score: weightage > 0 ? (total / weightage) : 0 };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 10);

      // Performance trend by period — only months with actual scored submissions
      const periodScores = new Map<string, { total: number; weightage: number; hasScores: boolean }>();
      kpis.forEach(kpi => {
        const period = kpi.review_period || 'Unknown';
        const score = getScore(kpi);
        if (score === null) return; // Skip KPIs with no actual score
        const w = kpi.weightage || 100;
        const existing = periodScores.get(period);
        if (existing) { existing.total += score * w; existing.weightage += w; existing.hasScores = true; }
        else periodScores.set(period, { total: score * w, weightage: w, hasScores: true });
      });
      const trendData = FISCAL_MONTHS
        .filter(m => periodScores.has(m) && periodScores.get(m)!.hasScores)
        .map(m => ({ period: m, avgScore: periodScores.get(m)!.weightage > 0 ? (periodScores.get(m)!.total / periodScores.get(m)!.weightage) : 0 }))
        .filter(d => d.avgScore >= 0.1); // Skip months with essentially unprocessed data (near-zero averages)

      // Reviewer analytics — manager score bias
      const managerScores = new Map<string, { total: number; count: number }>();
      kpis.forEach(kpi => {
        const rawSub = kpi.review_submissions;
        const submission = Array.isArray(rawSub) ? rawSub[0] : rawSub;
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

      // Manager vs. HR PMS / Auditor deviation
      const mgrDevMap = new Map<string, {
        mgrTotal: number; mgrCount: number;
        hrTotal: number; hrCount: number;
        audTotal: number; audCount: number;
      }>();
      kpis.forEach(kpi => {
        const raw = kpi.review_submissions;
        const s = Array.isArray(raw) ? raw[0] : raw;
        if (!s || s.manager_score == null || s.manager_score <= 0) return;
        const profile = profileMap.get(kpi.employee_id);
        const managerId = profile?.reporting_manager_id;
        if (!managerId) return;
        const entry = mgrDevMap.get(managerId) || { mgrTotal: 0, mgrCount: 0, hrTotal: 0, hrCount: 0, audTotal: 0, audCount: 0 };
        entry.mgrTotal += s.manager_score; entry.mgrCount++;
        if (s.hr_pms_score != null && s.hr_pms_score > 0) { entry.hrTotal += s.hr_pms_score; entry.hrCount++; }
        if (s.auditor_score != null && s.auditor_score > 0) { entry.audTotal += s.auditor_score; entry.audCount++; }
        mgrDevMap.set(managerId, entry);
      });
      const managerReviewDeviation = Array.from(mgrDevMap.entries())
        .filter(([_, d]) => d.mgrCount >= 3 && (d.hrCount >= 1 || d.audCount >= 1))
        .map(([mid, d]) => {
          const mp = profileMap.get(mid);
          const avgMgrPct = (d.mgrTotal / d.mgrCount) * 20;
          const hrPmsDeviation = d.hrCount >= 1 ? avgMgrPct - (d.hrTotal / d.hrCount) * 20 : null;
          const auditorDeviation = d.audCount >= 1 ? avgMgrPct - (d.audTotal / d.audCount) * 20 : null;
          return { managerId: mid, managerName: mp?.full_name || 'Unknown', avgMgrPct, hrPmsDeviation, auditorDeviation, kpiCount: d.mgrCount };
        })
        .sort((a, b) => {
          const maxA = Math.max(Math.abs(a.hrPmsDeviation ?? 0), Math.abs(a.auditorDeviation ?? 0));
          const maxB = Math.max(Math.abs(b.hrPmsDeviation ?? 0), Math.abs(b.auditorDeviation ?? 0));
          return maxB - maxA;
        })
        .slice(0, 10);

      // Overdue reviews: KPIs in non-terminal stages updated > 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      // We can't filter by updated_at in our existing query, so approximate from what we have
      // Count KPIs stuck in intermediate stages  
      const overdueReviews = kpis.filter(k => 
        k.status && !['approved', 'kra_set'].includes(k.status) && isKpiOverdue(k)
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
        divisionPerformance: divisionPerformance.slice(0, 10),
        ratingDistribution: [
          { name: 'Outstanding (5)', value: ratingCounts.band5, color: CHART_COLORS[0] },
          { name: 'Exceeds Expectations (4)', value: ratingCounts.band4, color: CHART_COLORS[1] },
          { name: 'Meets Expectations (3)', value: ratingCounts.band3, color: CHART_COLORS[2] },
          { name: 'Needs Improvement (2)', value: ratingCounts.band2, color: CHART_COLORS[3] },
          { name: 'Below Expectations (0-1)', value: ratingCounts.band1, color: CHART_COLORS[4] },
        ],
        meanScore,
        stdDev,
        completionRate: currentMetrics.completionRate,
        avgScore: currentMetrics.avgScore,
        trends,
        hasPreviousPeriod: false,
        previousPeriodName: null,
        topPerformers,
        bottomPerformers,
        trendData,
        reviewerAnalytics,
        orgMeanPct,
        managerReviewDeviation,
        overdueReviews,
      };
     } catch (error) {
        console.error('Management dashboard query error:', error);
        throw error;
     }
    },
    enabled: !filtersLoading,
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


  const getScoreColor = (score: number) => {
    if (score >= 4) return RATING_COLORS.excellent;
    if (score >= 3) return RATING_COLORS.good;
    if (score >= 2) return RATING_COLORS.average;
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
    doc.text(`${fiscalYearLabel} | Months: ${selectedMonths.length === 12 ? 'All' : selectedMonths.map(m => m.substring(0, 3)).join(', ')}`, 14, 30);
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
    if (dashboardData?.divisionPerformance?.length) {
      const lastY = (doc as any).lastAutoTable?.finalY || 100;
      doc.text('Division Performance', 14, lastY + 10);
      autoTable(doc, {
        startY: lastY + 14,
        head: [['Division', 'Employees', 'Avg Score', 'Completion', 'Risk Flags']],
        body: dashboardData.divisionPerformance.map((d: any) => [
          d.division, String(d.totalEmployees), `${d.avgScore.toFixed(1)}%`, `${d.completionRate.toFixed(0)}%`, String(d.riskFlags),
        ]),
      });
    }

    doc.save(`management-dashboard-${fiscalYearLabel}.pdf`);
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

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Management Dashboard" description="Executive overview of organizational performance" backTo="/dashboard" />
        <Card className="max-w-lg mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Failed to load dashboard</CardTitle>
            <CardDescription>An error occurred while fetching data. Please try again.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Select value={selectedFiscalYear.toString()} onValueChange={(v) => setSelectedFiscalYear(parseInt(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <SelectItem key={y} value={y.toString()}>FY {y}-{(y + 1).toString().slice(-2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Multi-Month Toggle Grid */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={selectedMonths.length === 12 ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2"
              onClick={selectAllMonths}
            >
              All
            </Button>
            <div className="h-5 w-px bg-border" />
            {FISCAL_MONTHS.map((month, i) => (
              <Toggle
                key={month}
                pressed={selectedMonths.includes(month)}
                onPressedChange={() => toggleMonth(month)}
                size="sm"
                className="text-xs h-7 px-2"
              >
                {FISCAL_MONTHS_SHORT[i]}
              </Toggle>
            ))}
            {selectedMonths.length < 12 && (
              <Badge variant="secondary" className="text-xs h-6 px-2 ml-1">
                {selectedMonths.length} {selectedMonths.length === 1 ? 'month' : 'months'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

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
                {(dashboardData?.avgScore || 0).toFixed(2)} / 5
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
        <RatingBellCurve data={dashboardData?.ratingDistribution || []} meanScore={dashboardData?.meanScore ?? 0} stdDev={dashboardData?.stdDev ?? 0} />
      </div>

      {/* Division Performance Table with Risk Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Division Performance
          </CardTitle>
          <CardDescription>Completion rates, scores, and risk flags by division</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Division</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead className="text-center">Risk Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(dashboardData?.divisionPerformance || []).map((div: any) => (
                  <TableRow key={div.division} className={div.riskFlags > 2 ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">{div.division}</TableCell>
                    <TableCell className="text-center">{div.totalEmployees}</TableCell>
                    <TableCell className="text-right">
                      <span className={getScoreColor(div.avgScore)}>{div.avgScore.toFixed(2)} / 5</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={div.completionRate} className="w-16 h-2" />
                        <span className="text-sm w-12 text-right">{div.completionRate.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {div.riskFlags > 0 ? (
                        <Badge variant={div.riskFlags > 2 ? 'destructive' : 'secondary'}>
                          {div.riskFlags}
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

      {/* Direct Reportees Monitoring */}
      <DirectReporteesMonitor
        fiscalStartYear={selectedFiscalYear}
        selectedMonths={selectedMonths}
      />

      {/* Action Items & Approvals */}
      <ActionItemsCards
        overdueReviews={dashboardData?.overdueReviews || 0}
        pendingRollbacks={rollbackCounts?.pending || 0}
        openQueries={dashboardData?.openQueries || 0}
        pendingIncentiveAdjustments={pendingAdjustments}
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
                        <span className={getScoreColor(review.avgScore)}>{review.avgScore.toFixed(2)} / 5</span>
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

      {/* Reviewer Analytics + Manager Deviation + Training Gap */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReviewerAnalyticsTable
          data={dashboardData?.reviewerAnalytics || []}
          orgMean={dashboardData?.orgMeanPct || 0}
        />
        <ManagerReviewDeviationTable
          data={dashboardData?.managerReviewDeviation || []}
        />
        <TrainingGapSummary
          reviewPeriod={isSingleMonth ? selectedMonths[0] : undefined}
          reviewYear={selectedFiscalYear}
        />
      </div>

      {/* Review Period Status + Audit Log + Notifications */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReviewPeriodStatusWidget fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
        <RecentAuditLog fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
        <NotificationsSummary fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
      </div>

      {/* Pending Incentive Adjustments */}
      {pendingAdjustments > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Pending Incentive Adjustments</p>
              <p className="text-xs text-muted-foreground">{pendingAdjustments} retroactive slab change{pendingAdjustments > 1 ? 's' : ''} awaiting payroll notification</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/reports/incentive')}>
              <Award className="h-4 w-4 mr-1" /> View Report
            </Button>
          </CardContent>
        </Card>
      )}

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

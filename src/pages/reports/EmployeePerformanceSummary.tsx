import { useState, useMemo, useEffect } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPaged } from '@/lib/fetchAll';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Search, Users, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FrequencyLockToggle } from '@/components/ui/FrequencyLockToggle';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import { EmployeeStatusFilter } from '@/components/reports/EmployeeStatusFilter';
import { applyEmployeeStatusFilter, employeeStatusLabel, type EmployeeStatusMode } from '@/lib/reportEmployeeFilter';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  management_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  audit: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  hr_pms_review: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
  skip_level_check: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  self_review: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  kra_set: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  management_review: 'Management Review',
  audit: 'Audit',
  hr_pms_review: 'HR PMS Review',
  skip_level_check: 'Skip-Level Check',
  manager_check: 'Manager Check',
  self_review: 'Self Review',
  kra_set: 'KRA Set',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Workflow priority order (lowest = earliest stage) */
const STATUS_PRIORITY_ORDER = [
  'kra_set', 'self_review', 'manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review', 'approved',
];

interface EmployeePerformance {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  division: string;
  department: string;
  designation: string;
  reportingManager: string;
  reviewPeriod: string;
  reviewYear: number;
  statusCounts: Record<string, number>;
  totalScore: number;
  outOfScore: number;
  totalWeight: number;
  kpiCount: number;
  lockedKpiCount: number;
  orphanedKpiCount: number;
  orphanedStatuses: Set<string>;
  isActive?: boolean;
}

export default function EmployeePerformanceSummary() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('employee-summary');
  const { getCompanyCode } = useCompanyFilter();
  const { isReady, user } = useAuth();
  const currentYear = new Date().getFullYear();
  
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeTab, setActiveTab] = useState('summary');
  const [comparisonEmployee, setComparisonEmployee] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFreqLocked, setShowFreqLocked] = useState(false);
  const [empStatusMode, setEmpStatusMode] = useState<EmployeeStatusMode>('active');

  // (review_periods query removed – month filter is now static)

  // Fetch all KPIs with separate submission query to avoid RLS timeout
  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['employee-performance-summary', user?.id, selectedYear, selectedPeriod],
    enabled: isReady && !!user,
    queryFn: async () => {
      const year = parseInt(selectedYear);
      
      // Step 1: Fetch KPIs only (no join) — RLS evaluated on kpis table alone
      const allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('kpis')
          .select('id, employee_id, kra_name, kpi_name, weightage, status, review_period, review_year, frequency, frequency_cycle_start')
          .eq('review_year', year)
          .order('id')
          .range(offset, offset + batchSize - 1);

        if (selectedPeriod !== 'all') {
          query = query.eq('review_period', selectedPeriod);
        }

        const { data: kpis, error } = await query;
        if (error) throw error;

        if (kpis && kpis.length > 0) {
          allKpis.push(...kpis);
          offset += batchSize;
          hasMore = kpis.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Step 2: Fetch submissions separately for those KPI IDs
      const kpiIds = allKpis.map(k => k.id);
      const submissionMap = new Map<string, any>();
      
      const inBatchSize = 300; // Smaller batch for .in() to avoid URL length limits
      for (let i = 0; i < kpiIds.length; i += inBatchSize) {
        const batch = kpiIds.slice(i, i + inBatchSize);
        const { data: subs, error: subError } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, is_na')
          .in('kpi_id', batch);
        if (subError) throw subError;
        subs?.forEach(s => submissionMap.set(s.kpi_id, s));
      }

      // Merge submissions into KPIs
      allKpis.forEach(kpi => {
        kpi.review_submissions = submissionMap.get(kpi.id) || null;
      });

      // Fetch all profiles with department info. Must be paged: active roster
      // exceeds PostgREST's 1000-row default cap, which otherwise drops most
      // KPI owners and makes admin reports appear empty.
      const profiles = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select(`
            id,
            employee_code,
            full_name,
            designation,
            reporting_manager_id,
            is_active,
            departments (name, business_units (name, divisions (name)))
          `)
          .order('id')
          .range(from, to)
      );

      // Create profile lookup map
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Group KPIs by employee and period
      const employeePeriodMap = new Map<string, EmployeePerformance>();

      allKpis.forEach(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        if (!profile) return;

        const submission = kpi.review_submissions;
        // Skip N/A KPIs entirely
        if (submission?.is_na) return;

        // Report Aggregation Parity (POLICY): lock is evaluated against the
        // KPI's OWN review_period, never the active UI filter. Otherwise the
        // same Feb-26 row produces different totals between "All Months" and
        // a specific-month filter (RCA: Jitendra / Sajid Raza Feb-26 — All
        // Months 69.04% vs February 54.37%). POLICY §128 still applies for
        // per-KPI frequency_cycle_start so non-default cycles (e.g. Bi-Monthly
        // Feb-Mar) are classified correctly.
        const isLocked = isKpiLockedForPeriod(
          kpi.frequency,
          kpi.review_period,
          kpi.review_year || year,
          kpi.frequency_cycle_start,
        );

        const manager = profile.reporting_manager_id 
          ? profileMap.get(profile.reporting_manager_id) 
          : null;

        const key = `${kpi.employee_id}-${kpi.review_period}`;
        const existing = employeePeriodMap.get(key);

        const score = (kpi.status === 'approved' ? submission?.final_score : null) ??
                      submission?.management_score ?? 
                      submission?.auditor_score ?? 
                      submission?.hr_pms_score ?? 
                      submission?.skip_level_score ?? 
                      submission?.manager_score ?? 
                      submission?.self_score ?? 0;
        const weight = kpi.weightage || 0;
        const weightedScore = isLocked ? 0 : score * weight;
        const maxScore = isLocked ? 0 : weight * 5;

        const kpiStatus = kpi.status || 'kra_set';

        if (existing) {
          if (!isLocked) {
            existing.totalScore += weightedScore;
            existing.outOfScore += maxScore;
            existing.totalWeight += weight;
            existing.kpiCount += 1;
            existing.statusCounts[kpiStatus] = (existing.statusCounts[kpiStatus] || 0) + 1;
          } else {
            existing.lockedKpiCount += 1;
          }
        } else {
          employeePeriodMap.set(key, {
            employeeId: kpi.employee_id,
            employeeCode: profile.employee_code || '-',
            fullName: profile.full_name || 'Unknown',
            division: (profile.departments as any)?.business_units?.divisions?.name || '-',
            department: (profile.departments as any)?.name || '-',
            designation: profile.designation || '-',
            reportingManager: manager?.full_name || '-',
            reviewPeriod: kpi.review_period || '-',
            reviewYear: kpi.review_year || year,
            statusCounts: isLocked ? {} : { [kpiStatus]: 1 },
            totalScore: weightedScore,
            outOfScore: maxScore,
            totalWeight: isLocked ? 0 : weight,
            kpiCount: isLocked ? 0 : 1,
            lockedKpiCount: isLocked ? 1 : 0,
            orphanedKpiCount: 0,
            orphanedStatuses: new Set<string>(),
            isActive: (profile as any).is_active !== false,
          });
        }
      });

      return Array.from(employeePeriodMap.values());
    },
  });

  // Bulk workflow fetch for orphan detection
  const perfEmployeeIds = useMemo(() => {
    if (!performanceData) return [];
    const ids = new Set<string>();
    performanceData.forEach(r => ids.add(r.employeeId));
    return Array.from(ids);
  }, [performanceData]);

  const { data: perfWorkflowMap } = useBulkEmployeeWorkflows(
    perfEmployeeIds,
    selectedPeriod !== 'all' ? selectedPeriod : undefined,
    selectedPeriod !== 'all' ? parseInt(selectedYear) : undefined
  );

  // Enrich performance data with orphan detection (per-employee status check)
  const enrichedPerformanceData = useMemo(() => {
    if (!performanceData) return [];
    if (!perfWorkflowMap || perfWorkflowMap.size === 0) return performanceData;
    return performanceData.map(row => {
      const stages = perfWorkflowMap.get(row.employeeId);
      if (!stages) return row;
      const orphanedStatuses = new Set<string>();
      let orphanedCount = 0;
      Object.entries(row.statusCounts).forEach(([status, count]) => {
        if (status !== 'approved' && status !== 'kra_set' && !stages.includes(status)) {
          orphanedStatuses.add(status);
          orphanedCount += count;
        }
      });
      if (orphanedCount > 0) {
        return { ...row, orphanedKpiCount: orphanedCount, orphanedStatuses };
      }
      return row;
    });
  }, [performanceData, perfWorkflowMap]);

  // Fetch comparison data (all periods for trend analysis)
  const { data: trendData } = useQuery({
    queryKey: ['employee-performance-trends', user?.id, selectedYear],
    enabled: isReady && !!user && activeTab === 'comparison',
    queryFn: async () => {
      const year = parseInt(selectedYear);
      
      // Step 1: Fetch KPIs without join
      const allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
          const { data: kpis, error } = await supabase
            .from('kpis')
            .select('id, employee_id, weightage, status, review_period, review_year, frequency, frequency_cycle_start')
            .eq('review_year', year)
            .order('id')
            .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (kpis && kpis.length > 0) {
          allKpis.push(...kpis);
          offset += batchSize;
          hasMore = kpis.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Step 2: Fetch submissions separately
      const kpiIds = allKpis.map(k => k.id);
      const submissionMap = new Map<string, any>();
      
      const inBatchSize = 300;
      for (let i = 0; i < kpiIds.length; i += inBatchSize) {
        const batch = kpiIds.slice(i, i + inBatchSize);
        const { data: subs, error: subError } = await supabase
          .from('review_submissions')
          .select('kpi_id, final_score, self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, is_na')
          .in('kpi_id', batch);
        if (subError) throw subError;
        subs?.forEach(s => submissionMap.set(s.kpi_id, s));
      }

      // Merge
      allKpis.forEach(kpi => {
        kpi.review_submissions = submissionMap.get(kpi.id) || null;
      });

      // Group by employee and period (weighted scoring matching Dashboard)
      const employeeTrends = new Map<string, Map<string, { totalScore: number; outOfScore: number; totalWeight: number }>>();

      allKpis.forEach(kpi => {
        const submission = kpi.review_submissions;
        // Skip N/A KPIs
        if (submission?.is_na) return;

        if (!employeeTrends.has(kpi.employee_id)) {
          employeeTrends.set(kpi.employee_id, new Map());
        }

        const periodMap = employeeTrends.get(kpi.employee_id)!;
        const existing = periodMap.get(kpi.review_period);

        const score = (kpi.status === 'approved' ? submission?.final_score : null) ??
                      submission?.management_score ?? 
                      submission?.auditor_score ?? 
                      submission?.hr_pms_score ?? 
                      submission?.skip_level_score ?? 
                      submission?.manager_score ?? 
                      submission?.self_score ?? 0;
        const weight = kpi.weightage || 0;
        const weightedScore = score * weight;
        const maxScore = weight * 5;

        if (existing) {
          existing.totalScore += weightedScore;
          existing.outOfScore += maxScore;
          existing.totalWeight += weight;
        } else {
          periodMap.set(kpi.review_period, { totalScore: weightedScore, outOfScore: maxScore, totalWeight: weight });
        }
      });

      return employeeTrends;
    },
  });

  // getStatusPriority removed — statusCounts map replaces single-status logic

  // Filter and sort data by percentage descending (matching Excel format)
  const filteredData = useMemo(() => {
    if (!enrichedPerformanceData) return [];
    
    const term = searchTerm.toLowerCase();
    const statusFiltered = applyEmployeeStatusFilter(
      enrichedPerformanceData,
      empStatusMode,
      (r) => r.isActive
    );
    return statusFiltered
      .filter(row => {
        // Hide employees that only have frequency-locked KPIs when toggle is off
        if (!showFreqLocked && row.kpiCount === 0 && row.lockedKpiCount > 0) return false;
        // Status filter
        if (selectedStatus !== 'all' && !(row.statusCounts[selectedStatus] > 0)) return false;
        // Search filter
        return (
      row.fullName.toLowerCase().includes(term) ||
          row.employeeCode.toLowerCase().includes(term) ||
          row.division.toLowerCase().includes(term) ||
          row.department.toLowerCase().includes(term) ||
          row.designation.toLowerCase().includes(term) ||
          row.reportingManager.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const pctA = a.outOfScore > 0 ? (a.totalScore / a.outOfScore) * 100 : 0;
        const pctB = b.outOfScore > 0 ? (b.totalScore / b.outOfScore) * 100 : 0;
        return pctB - pctA;
      });
  }, [enrichedPerformanceData, searchTerm, selectedStatus, showFreqLocked, empStatusMode]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear, selectedPeriod, selectedStatus, pageSize, showFreqLocked]);

  // Get unique employees for comparison
  const uniqueEmployees = useMemo(() => {
    if (!enrichedPerformanceData) return [];
    const seen = new Set<string>();
    return enrichedPerformanceData
      .filter(row => {
        if (seen.has(row.employeeId)) return false;
        seen.add(row.employeeId);
        return true;
      })
      .map(row => ({ id: row.employeeId, name: row.fullName, code: row.employeeCode }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrichedPerformanceData]);

  // Comparison chart data
  const comparisonChartData = useMemo(() => {
    if (!trendData || !comparisonEmployee) return [];

    const employeeTrend = trendData.get(comparisonEmployee);
    if (!employeeTrend) return [];

    // Sort periods by month order
    const periodOrder = MONTHS.map(m => m.toLowerCase());
    
    return Array.from(employeeTrend.entries())
      .sort((a, b) => {
        const aIndex = periodOrder.findIndex(m => a[0].toLowerCase().startsWith(m));
        const bIndex = periodOrder.findIndex(m => b[0].toLowerCase().startsWith(m));
        return aIndex - bIndex;
      })
      .map(([period, data]) => ({
        period: formatPeriod(period, parseInt(selectedYear)),
        percentage: data.outOfScore > 0 ? ((data.totalScore / data.outOfScore) * 100) : 0,
        score: data.totalScore,
        outOf: data.outOfScore,
      }));
  }, [trendData, comparisonEmployee, selectedYear]);

  // Trend indicator for each employee
  const getTrendIndicator = (employeeId: string) => {
    if (!trendData) return null;
    
    const trends = trendData.get(employeeId);
    if (!trends || trends.size < 2) return null;

    const periods = Array.from(trends.entries())
      .sort((a, b) => {
        const aIndex = MONTHS.findIndex(m => a[0].toLowerCase().startsWith(m.toLowerCase()));
        const bIndex = MONTHS.findIndex(m => b[0].toLowerCase().startsWith(m.toLowerCase()));
        return aIndex - bIndex;
      });

    if (periods.length < 2) return null;

    const latest = periods[periods.length - 1][1];
    const previous = periods[periods.length - 2][1];

    const latestPct = latest.outOfScore > 0 ? (latest.totalScore / latest.outOfScore) * 100 : 0;
    const prevPct = previous.outOfScore > 0 ? (previous.totalScore / previous.outOfScore) * 100 : 0;

    const diff = latestPct - prevPct;

    if (Math.abs(diff) < 2) {
      return { icon: Minus, color: 'text-muted-foreground', label: 'Stable' };
    } else if (diff > 0) {
      return { icon: TrendingUp, color: 'text-green-600 dark:text-green-400', label: `+${diff.toFixed(1)}%` };
    } else {
      return { icon: TrendingDown, color: 'text-red-600 dark:text-red-400', label: `${diff.toFixed(1)}%` };
    }
  };

  function calculateRating(totalScore: number, _outOfScore: number, totalWeight?: number): number {
    const weight = totalWeight ?? _outOfScore;
    if (weight === 0) return 0;
    // Dashboard formula: totalScore / totalWeight (weighted average rating out of 5)
    return Math.round((totalScore / weight) * 100) / 100;
  }

  function formatPeriod(period: string, year: number): string {
    const monthIndex = MONTHS.findIndex(m => 
      period.toLowerCase().startsWith(m.toLowerCase())
    );
    if (monthIndex >= 0) {
      return `${MONTHS[monthIndex]}-${String(year).slice(-2)}`;
    }
    return period;
  }

  const handleExport = () => {
    if (!filteredData.length) return;

    const exportData = filteredData.map(row => {
      const percentage = row.outOfScore > 0 
        ? ((row.totalScore / row.outOfScore) * 100).toFixed(2) + '%'
        : '0.00%';
      const rating = calculateRating(row.totalScore, row.outOfScore, row.totalWeight);

      return {
        'Company': getCompanyCode(row.employeeId),
        'Month': formatPeriod(row.reviewPeriod, row.reviewYear),
        'Employee ID': row.employeeCode,
        'Full Name': row.fullName,
        'Division': row.division,
        'Department': row.department,
        'Designation': row.designation,
        'Reporting Manager': row.reportingManager,
        'Review Status': STATUS_PRIORITY_ORDER
          .filter(s => (row.statusCounts[s] || 0) > 0)
          .map(s => {
            const count = row.statusCounts[s];
            const label = STATUS_LABELS[s] || s;
            return count > 1 ? `${label} (${count})` : label;
          })
          .join(', '),
        'Total Score': row.totalScore,
        'Out of Score': row.outOfScore,
        'Overall Rating': rating,
        'Percentage': percentage,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    // Prepend metadata header row indicating filter scope
    XLSX.utils.sheet_add_aoa(ws, [[`Filter: ${employeeStatusLabel(empStatusMode)}`]], { origin: -1 });
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Performance Summary');
    
    ws['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 35 }, { wch: 30 },
      { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    ];

    XLSX.writeFile(wb, `Employee_Performance_Summary${selectedPeriod !== 'all' ? `_${selectedPeriod}` : ''}_${selectedYear}.xlsx`);
  };

  const summaryStats = useMemo(() => {
    if (!filteredData.length) return { total: 0, approved: 0, avgScore: 0 };
    
    const approved = filteredData.filter(r => {
      const statuses = Object.keys(r.statusCounts);
      return statuses.length === 1 && statuses[0] === 'approved';
    }).length;
    const totalPercentage = filteredData.reduce((sum, r) => {
      return sum + (r.outOfScore > 0 ? (r.totalScore / r.outOfScore) * 100 : 0);
    }, 0);

    return {
      total: filteredData.length,
      approved,
      avgScore: filteredData.length > 0 ? (totalPercentage / filteredData.length).toFixed(1) : 0,
    };
  }, [filteredData]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Employee Performance Summary${selectedPeriod !== 'all' ? ` - ${selectedPeriod}` : ''}`}
        description="Comprehensive view of employee scores, ratings, and review status"
        backTo="/reports"
        actions={
          canExport ? (
            <div className="flex items-center gap-3">
              <EmployeeStatusFilter onChange={setEmpStatusMode} />
              <Button onClick={handleExport} disabled={!filteredData.length}>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </Button>
            </div>
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">Summary View</TabsTrigger>
          <TabsTrigger value="comparison">Period Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 mt-6">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, ID, department..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {FULL_MONTHS.map(month => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FrequencyLockToggle
                  checked={showFreqLocked}
                  onCheckedChange={v => { setShowFreqLocked(v); setCurrentPage(1); }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.total}</div>
                <p className="text-xs text-muted-foreground">
                  Showing {paginatedData.length} of {filteredData.length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved Reviews</CardTitle>
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                  {summaryStats.approved}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryStats.total > 0 
                    ? ((summaryStats.approved / summaryStats.total) * 100).toFixed(1) 
                    : 0}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryStats.avgScore}%</div>
              </CardContent>
            </Card>
          </div>

          {/* Data Table with Pagination */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead>Employee ID</TableHead>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Division</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Designation</TableHead>
                          <TableHead>Reporting Manager</TableHead>
                          <TableHead>Review Status</TableHead>
                          <TableHead className="text-right">Total Score</TableHead>
                          <TableHead className="text-right">Out of Score</TableHead>
                          <TableHead className="text-right">Overall Rating</TableHead>
                          <TableHead className="text-right">Percentage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                              No data found for the selected filters
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedData.map((row, index) => {
                            const percentage = row.outOfScore > 0 
                              ? ((row.totalScore / row.outOfScore) * 100)
                              : 0;
                            const rating = calculateRating(row.totalScore, row.outOfScore, row.totalWeight);

                            return (
                              <TableRow key={`${row.employeeId}-${row.reviewPeriod}-${index}`}>
                                <TableCell className="font-medium">
                                  {formatPeriod(row.reviewPeriod, row.reviewYear)}
                                </TableCell>
                                <TableCell>{row.employeeCode}</TableCell>
                                <TableCell>{row.fullName}</TableCell>
                                <TableCell>{row.division}</TableCell>
                                <TableCell>{row.department}</TableCell>
                                <TableCell>{row.designation}</TableCell>
                                <TableCell>{row.reportingManager}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {(() => {
                                      const statuses = Object.keys(row.statusCounts);
                                      const allApproved = statuses.length === 1 && statuses[0] === 'approved';
                                      if (allApproved) {
                                        return (
                                          <Badge variant="outline" className={STATUS_COLORS['approved']}>
                                            Approved
                                          </Badge>
                                        );
                                      }
                                      const badges = STATUS_PRIORITY_ORDER
                                        .filter(s => (row.statusCounts[s] || 0) > 0)
                                        .map(s => {
                                          const isOrphaned = row.orphanedStatuses?.has(s);
                                          return (
                                            <Badge key={s} variant="outline" className={`text-[11px] px-1.5 py-0 ${isOrphaned ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : (STATUS_COLORS[s] || 'bg-muted')}`}>
                                              {isOrphaned ? '⚠ ' : ''}{STATUS_LABELS[s] || s}{row.statusCounts[s] > 1 ? ` (${row.statusCounts[s]})` : ''}
                                            </Badge>
                                          );
                                        });
                                      return badges;
                                    })()}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {row.totalScore.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {row.outOfScore.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {rating.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={
                                    percentage >= 80 ? 'text-green-600 dark:text-green-400' :
                                    percentage >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                    'text-destructive'
                                  }>
                                    {percentage.toFixed(2)}%
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
                  {filteredData.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-4 border-t">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Rows per page:</span>
                        <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                          <SelectTrigger className="w-[70px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_SIZE_OPTIONS.map(size => (
                              <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6 mt-6">
          {/* Employee Selector for Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Trend Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select 
                  value={comparisonEmployee || ''} 
                  onValueChange={setComparisonEmployee}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Select an employee to view trends" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} ({emp.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Trend Chart */}
          {comparisonEmployee && comparisonChartData.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Performance Over Time - {uniqueEmployees.find(e => e.id === comparisonEmployee)?.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparisonChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          if (name === 'percentage') return [`${value.toFixed(2)}%`, 'Score %'];
                          return [value, name];
                        }}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="percentage" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                        name="Score %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Period Details Table */}
                <div className="mt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Total Score</TableHead>
                        <TableHead className="text-right">Out of Score</TableHead>
                        <TableHead className="text-right">Percentage</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonChartData.map((row, index) => {
                        const prevRow = index > 0 ? comparisonChartData[index - 1] : null;
                        const change = prevRow ? row.percentage - prevRow.percentage : 0;

                        return (
                          <TableRow key={row.period}>
                            <TableCell className="font-medium">{row.period}</TableCell>
                            <TableCell className="text-right">{row.score.toFixed(1)}</TableCell>
                            <TableCell className="text-right">{row.outOf.toFixed(1)}</TableCell>
                            <TableCell className="text-right">
                              <span className={
                                row.percentage >= 80 ? 'text-green-600 dark:text-green-400' :
                                row.percentage >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-destructive'
                              }>
                                {row.percentage.toFixed(2)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              {index > 0 ? (
                                <span className={
                                  change > 0 ? 'text-green-600 dark:text-green-400' :
                                  change < 0 ? 'text-destructive' :
                                  'text-muted-foreground'
                                }>
                                  {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {comparisonEmployee 
                  ? 'No trend data available for this employee'
                  : 'Select an employee to view their performance trends across periods'}
              </CardContent>
            </Card>
          )}

          {/* All Employees Trend Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Employee Trend Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Latest %</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uniqueEmployees.slice(0, 20).map(emp => {
                      const latestData = performanceData?.find(p => p.employeeId === emp.id);
                      const trend = getTrendIndicator(emp.id);
                      const percentage = latestData && latestData.outOfScore > 0
                        ? (latestData.totalScore / latestData.outOfScore) * 100
                        : 0;

                      return (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell>{latestData?.department || '-'}</TableCell>
                          <TableCell className="text-right">
                            <span className={
                              percentage >= 80 ? 'text-green-600 dark:text-green-400' :
                              percentage >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-destructive'
                            }>
                              {percentage.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {trend ? (
                              <div className={`inline-flex items-center gap-1 ${trend.color}`}>
                                <trend.icon className="h-4 w-4" />
                                <span className="text-xs">{trend.label}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setComparisonEmployee(emp.id)}
                            >
                              View Trend
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {uniqueEmployees.length > 20 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Showing first 20 employees. Use the selector above to view specific employees.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

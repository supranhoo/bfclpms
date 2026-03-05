import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKpis, useReviewSubmissions, KPI } from '@/hooks/useKpis';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { useKraCategories, useSkipLevelTeamMembers } from '@/hooks/useOrganization';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useKpiSorting } from '@/hooks/useKpiSorting';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCumulativeKpis } from '@/hooks/useCumulativeKpis';
import { useSubPeriodSubmissionsByKpis } from '@/hooks/useSubPeriodSubmissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeletons';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { KeyStatCard } from '@/components/dashboard/KeyStatCard';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart, type CategorySortBy } from '@/components/dashboard/CategoryScoreChart';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { MobileKpiCard } from '@/components/dashboard/MobileKpiCard';
import { CumulativeSummaryCard } from '@/components/dashboard/CumulativeSummaryCard';
import { TrendArrow } from '@/components/dashboard/KpiTrendIndicator';
import { KpiSortControl } from '@/components/ui/KpiSortControl';
import { ReviewPeriodSelectorEnhanced, useDefaultPeriodSelection, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { SelfReviewSheet } from '@/components/review/SelfReviewSheet';
import { MentionedKpiSheet } from '@/components/review/MentionedKpiSheet';
import { ViewModeToggle, ViewMode } from '@/components/review/ViewModeToggle';
import { EmployeeSelectorGrid } from '@/components/review/EmployeeSelectorGrid';
import { UnifiedScorecard } from '@/components/review/UnifiedScorecard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Target, TrendingUp, CheckCircle2, Clock, BarChart3, Info, Building2, Users, User, ClipboardEdit, Eye, AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateOverallCumulativeScore, calculateCategoryCumulative, getScoreForPeriod } from '@/lib/cumulativeScoring';
import { FrequencyLockBadge } from '@/components/review/FrequencyLockedOverlay';
import { KraExportMenu } from '@/components/review/KraExportMenu';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useAuditKpiAssignments } from '@/hooks/useAuditKpiAssignments';
import { AuditKpiAssignPopover } from '@/components/review/AuditKpiAssignPopover';

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  relationship?: 'direct' | 'indirect';
}

import { statusColors, statusLabels, getScoreBadgeClass } from '@/lib/reviewConstants';

export default function Dashboard() {
  const { profile, effectiveRole: role } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: kpis, isLoading: kpisLoading } = useMyKpis();
  const { data: categories, isLoading: categoriesLoading } = useKraCategories();
  const { data: selfWorkflowStagesData } = useEmployeeWorkflowStages(profile?.id || '');
  const selfWorkflowStages = selfWorkflowStagesData || DEFAULT_WORKFLOW_STAGES;
  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);

  // Audit KPI-level assignments (only for auditor/admin roles)
  const isAuditCapable = role === 'auditor' || role === 'admin';
  const { data: auditKpiAssignments } = useAuditKpiAssignments(isAuditCapable ? kpiIds : []);

  const [selectedKpiTracker, setSelectedKpiTracker] = useState<KPI | null>(null);
  const [selectedKpiLogic, setSelectedKpiLogic] = useState<KPI | null>(null);
  const [selectedKpiReview, setSelectedKpiReview] = useState<KPI | null>(null);
  const [autoOpenQueryHistory, setAutoOpenQueryHistory] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [categorySortBy, setCategorySortBy] = useState<CategorySortBy>('score-desc');
  
  // Enhanced period selection with cumulative mode support
  const defaultPeriodSelection = useDefaultPeriodSelection();
  const [periodSelection, setPeriodSelection] = useState<PeriodSelection>(defaultPeriodSelection);
  
  // Derived values for backward compatibility
  const selectedPeriod = periodSelection.selectedMonth;
  const selectedYear = periodSelection.selectedYear;
  const isCumulativeMode = periodSelection.mode !== 'single';

  // View mode state for unified dashboard
  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [autoOpenKpiId, setAutoOpenKpiId] = useState<string | null>(null);
  const [mentionedKpi, setMentionedKpi] = useState<{ kpiId: string; employeeId: string } | null>(null);
  
  // Cumulative KPI data (only fetched in cumulative modes)
  const cumulativeData = useCumulativeKpis({
    employeeId: profile?.id || '',
    periodRanges: periodSelection.periodRanges,
    enabled: isCumulativeMode && viewMode === 'self' && !!profile?.id,
  });

  // Fetch org KPI values for this period
  const { data: orgKpiValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);

  // Create org KPI values lookup map
  const orgKpiValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null; entered_by_name: string | null }>();
    orgKpiValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source, entered_by_name: v.entered_by_name });
    });
    return map;
  }, [orgKpiValues]);

  // Helper to get org KPI value based on scope
  const getOrgKpiValue = useCallback((kpi: KPI) => {
    if (!kpi.is_org_level) return null;
    const scope = (kpi as any).org_level_scope || 'employee';
    let key: string;
    if (scope === 'organization') {
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    } else if (scope === 'department') {
      const deptId = profile?.department_id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${deptId}||null`;
    } else {
      const empId = profile?.id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${empId}`;
    }
    return orgKpiValuesMap.get(key) || null;
  }, [orgKpiValuesMap, profile?.department_id, profile?.id]);

  // Period-filtered KPIs
  const periodFilteredKpis = useMemo(() => {
    return kpis?.filter(k => 
      k.review_period === selectedPeriod && k.review_year === selectedYear
    ) || [];
  }, [kpis, selectedPeriod, selectedYear]);

  // Pending period alert: detect earlier periods with actionable KPIs
  const [dismissedPendingPeriods, setDismissedPendingPeriods] = useState<string[]>([]);

  const pendingPeriods = useMemo(() => {
    if (!kpis || kpis.length === 0) return [];
    const actionableStatuses = ['kra_set', 'self_review'];
    const currentMonthIdx = MONTH_ORDER.indexOf(selectedPeriod);

    const periodMap = new Map<string, number>();
    kpis.forEach(k => {
      if (!actionableStatuses.includes(k.status || '')) return;
      if (!k.review_period || k.review_year == null) return;
      // Earlier year, or same year but earlier month
      const monthIdx = MONTH_ORDER.indexOf(k.review_period);
      const isEarlier = k.review_year < selectedYear || 
        (k.review_year === selectedYear && monthIdx < currentMonthIdx && monthIdx >= 0);
      if (!isEarlier) return;
      const key = `${k.review_period}-${k.review_year}`;
      periodMap.set(key, (periodMap.get(key) || 0) + 1);
    });

    return Array.from(periodMap.entries())
      .map(([key, count]) => {
        const [month, yearStr] = key.split('-');
        return { month, year: parseInt(yearStr), count, key };
      })
      .filter(p => !dismissedPendingPeriods.includes(p.key))
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return MONTH_ORDER.indexOf(b.month) - MONTH_ORDER.indexOf(a.month);
      });
  }, [kpis, selectedPeriod, selectedYear, dismissedPendingPeriods]);

  // Sub-period submissions for Daily/Weekly KPIs
  const periodFilteredKpiIds = useMemo(() => periodFilteredKpis.map(k => k.id), [periodFilteredKpis]);
  const { data: subPeriodSubmissions, isLoading: subPeriodLoading } = useSubPeriodSubmissionsByKpis(
    periodFilteredKpiIds, selectedPeriod, selectedYear
  );

  // Fetch ALL submissions across all periods for history
  const allKpiIds = useMemo(() => kpis?.map(k => k.id) || [], [kpis]);
  const { data: allSubmissions } = useReviewSubmissions(selectedKpiReview ? allKpiIds : []);

  const isLoading = kpisLoading || categoriesLoading;

  const submissionMap = useMemo(() => 
    new Map(submissions?.map(s => [s.kpi_id, s])), 
    [submissions]
  );

  // Detect skip-level subordinates (employees whose RM reports to current user)
  const { data: skipLevelMembers } = useSkipLevelTeamMembers(profile?.id);
  const hasSkipLevelSubordinates = (skipLevelMembers?.length || 0) > 0;

  // Calculate available modes based on role (skip_level merged into team)
  const availableModes = useMemo(() => {
    const modes: ViewMode[] = ['self'];
    if (['manager', 'admin', 'management'].includes(role || '') || hasSkipLevelSubordinates) modes.push('team');
    // skip_level no longer shown in toggle - merged into team
    if (role === 'hr_pms' || role === 'admin') modes.push('hr_pms');
    if (['auditor', 'admin'].includes(role || '')) modes.push('audit');
    if (['management', 'admin'].includes(role || '')) modes.push('management');
    return modes;
  }, [role, hasSkipLevelSubordinates]);

  // Handle mentioned_kpi deep-link (read-only @mention access)
  useEffect(() => {
    const mentionedKpiParam = searchParams.get('mentioned_kpi');
    const mentionedEmployeeParam = searchParams.get('mentioned_employee');
    if (mentionedKpiParam && mentionedEmployeeParam) {
      setMentionedKpi({ kpiId: mentionedKpiParam, employeeId: mentionedEmployeeParam });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('mentioned_kpi');
        next.delete('mentioned_employee');
        return next;
      }, { replace: true });
    }
  }, [searchParams]);

  // Initialize from URL query param
  useEffect(() => {
    const viewFromUrl = searchParams.get('view') as ViewMode | null;
    if (viewFromUrl) {
      // Map skip_level URL to team mode (merged)
      const mappedMode = viewFromUrl === 'skip_level' ? 'team' : viewFromUrl;
      if (availableModes.includes(mappedMode)) {
        setViewMode(mappedMode);
      }
    }
  }, [searchParams, availableModes]);

  // Deep-link: auto-open KPI sheet from URL params (?kpi=...)
  useEffect(() => {
    const kpiParam = searchParams.get('kpi');
    const panelParam = searchParams.get('panel');
    const employeeParam = searchParams.get('employee');

    // If employee param is present, handle cross-user deep-link (reviewer flow)
    if (employeeParam && kpiParam) {
      const fetchAndSelectEmployee = async () => {
        const { data: empProfile } = await supabase
          .from('profiles')
          .select('id, full_name, email, designation, employee_code, avatar_url, department_id, reporting_manager_id')
          .eq('id', employeeParam)
          .single();

        if (empProfile) {
          // Determine view from URL or default to team
          const viewParam = searchParams.get('view') as ViewMode | null;
          if (viewParam && availableModes.includes(viewParam)) {
            setViewMode(viewParam);
          } else if (viewMode === 'self') {
            setViewMode('team');
          }
          handleSelectEmployee(empProfile as EmployeeProfile, kpiParam);
        }

        // Clean up URL params
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('kpi');
          next.delete('panel');
          next.delete('employee');
          return next;
        }, { replace: true });
      };
      fetchAndSelectEmployee();
      return;
    }

    // Standard self-view deep-link
    if (!kpiParam) return;

    // If KPIs are still loading, wait
    if (kpisLoading) return;

    // Try to find KPI in current period
    const targetKpi = periodFilteredKpis.find(k => k.id === kpiParam);
    
    if (!targetKpi) {
      // KPI not in current period — look it up in all loaded KPIs and auto-switch period
      const allKpiMatch = kpis?.find(k => k.id === kpiParam);
      if (allKpiMatch && allKpiMatch.review_period && allKpiMatch.review_year != null) {
        // Auto-switch to the KPI's period
        setPeriodSelection(prev => ({
          ...prev,
          mode: 'single',
          selectedMonth: allKpiMatch.review_period!,
          selectedYear: allKpiMatch.review_year!,
        }));
        // Don't clean URL yet — let the effect re-run after period change
        return;
      }
      // KPI not found at all — clean up and bail
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('kpi');
        next.delete('panel');
        return next;
      }, { replace: true });
      return;
    }

    setSelectedKpiReview(targetKpi);
    if (panelParam === 'queryHistory') {
      setAutoOpenQueryHistory(true);
    }

    // Clean up URL params to prevent re-triggering
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('kpi');
      next.delete('panel');
      return next;
    }, { replace: true });
  }, [periodFilteredKpis, searchParams, kpisLoading, kpis]);

  // Step 2: Apply category and status filters on top of period filter
  const fullyFilteredKpis = useMemo(() => {
    let filtered = periodFilteredKpis;
    
    if (activeCategory !== 'All') {
      const cat = categories?.find(c => c.name === activeCategory);
      filtered = filtered.filter(k => k.category_id === cat?.id);
    }
    
    if (statusFilter) {
      filtered = filtered.filter(k => k.status === statusFilter);
    }
    
    return filtered;
  }, [periodFilteredKpis, activeCategory, categories, statusFilter]);

  // Calculate metrics from FILTERED KPIs - for single month mode
  const singleMonthMetrics = useMemo(() => {
    const data = fullyFilteredKpis;
    const totalKpis = data.length;
    const completedKpis = data.filter(k => k.status === 'approved').length;
    const pendingKpis = totalKpis - completedKpis;

    let totalScore = 0;
    let totalWeight = 0;
    let totalMaxScore = 0;

    data.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      if (submission?.is_na) return;
      
      const score = submission?.final_score 
        ?? submission?.management_score 
        ?? submission?.auditor_score 
        ?? submission?.manager_score 
        ?? submission?.self_score 
        ?? 0;
      const weight = kpi.weightage || 0;
      totalScore += score * weight;
      totalWeight += weight;
      totalMaxScore += weight * 5;
    });

    const overallRating = totalWeight > 0 ? totalScore / totalWeight : 0;
    const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

    return { totalKpis, completedKpis, pendingKpis, totalScore, totalMaxScore, overallRating, overallPercentage };
  }, [fullyFilteredKpis, submissionMap]);

  // Calculate cumulative metrics
  const cumulativeMetrics = useMemo(() => {
    if (!isCumulativeMode || cumulativeData.aggregatedKpis.length === 0) return null;
    
    const overall = calculateOverallCumulativeScore(cumulativeData.aggregatedKpis);
    const completedKpis = cumulativeData.aggregatedKpis.filter(k => k.totalSubmissions > 0).length;
    const totalKpis = cumulativeData.aggregatedKpis.length;
    
    return {
      score: overall.score,
      trend: overall.trend,
      completedKpis,
      totalKpis,
      pendingKpis: totalKpis - completedKpis,
      overallPercentage: overall.score !== null ? (overall.score / 5) * 100 : 0,
      overallRating: overall.score || 0,
    };
  }, [isCumulativeMode, cumulativeData.aggregatedKpis]);

  const metrics = isCumulativeMode && cumulativeMetrics ? {
    ...cumulativeMetrics,
    totalScore: (cumulativeMetrics.overallRating || 0) * 100,
    totalMaxScore: 500,
  } : singleMonthMetrics;

  // Category metrics
  const categoryMetrics = useMemo(() => {
    if (!categories) return [];
    const data = fullyFilteredKpis;

    return categories.map(cat => {
      const catKpis = data.filter(k => k.category_id === cat.id);
      let achieved = 0;
      let max = 0;

      catKpis.forEach(kpi => {
        const submission = submissionMap.get(kpi.id);
        const score = submission?.final_score ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? 0;
        const weight = kpi.weightage || 0;
        achieved += score * weight;
        max += weight * 5;
      });

      const categoryWeightage = catKpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);

      return {
        name: cat.name,
        percentage: max > 0 ? (achieved / max) * 100 : 0,
        color: cat.color,
        count: catKpis.length,
        weightage: categoryWeightage,
      };
    }).filter(c => c.count > 0);
  }, [categories, fullyFilteredKpis, submissionMap]);

  // Available categories for filter dropdown
  const availableCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter(cat => 
      periodFilteredKpis.some(k => k.category_id === cat.id)
    );
  }, [categories, periodFilteredKpis]);

  // Sorting
  const { sortedKpis, sortConfig, setSort } = useKpiSorting(fullyFilteredKpis, {}, submissionMap);

  // Handle mode change
  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSelectedEmployee(null);
    setAutoOpenKpiId(null);
  }, []);

  // Handle employee selection from grid
  const handleSelectEmployee = useCallback((employee: EmployeeProfile, kpiId?: string | null) => {
    setSelectedEmployee(employee);
    setAutoOpenKpiId(kpiId || null);
  }, []);

  // Loading state only for self view
  if (isLoading && viewMode === 'self') {
    return <DashboardSkeleton />;
  }

  // Render reviewer views (team, audit, management)
  if (viewMode !== 'self') {
    if (selectedEmployee) {
      // Determine viewLevel based on employee relationship tag (for merged team view)
      let viewLevelForScorecard: string;
      if (viewMode === 'team' && selectedEmployee.relationship === 'indirect') {
        viewLevelForScorecard = 'skip_level';
      } else {
        const viewLevelMap: Record<string, string> = { team: 'manager', audit: 'auditor', skip_level: 'skip_level', hr_pms: 'hr_pms', management: 'management' };
        viewLevelForScorecard = viewLevelMap[viewMode] || viewMode;
      }
      return (
        <div className="space-y-4">
          {availableModes.length > 1 && (
            <ViewModeToggle
              currentMode={viewMode}
              availableModes={availableModes}
              onModeChange={handleModeChange}
            />
          )}
          <UnifiedScorecard
            viewLevel={viewLevelForScorecard as 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'}
            employee={selectedEmployee}
            periodSelection={periodSelection}
            onPeriodSelectionChange={setPeriodSelection}
            onBack={() => {
              setSelectedEmployee(null);
              setAutoOpenKpiId(null);
            }}
            autoOpenKpiId={autoOpenKpiId}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {availableModes.length > 1 && (
          <ViewModeToggle
            currentMode={viewMode}
            availableModes={availableModes}
            onModeChange={handleModeChange}
          />
        )}
        <EmployeeSelectorGrid
          viewLevel={viewMode as Exclude<ViewMode, 'self'>}
          periodSelection={periodSelection}
          onPeriodSelectionChange={setPeriodSelection}
          onSelectEmployee={handleSelectEmployee}
        />
      </div>
    );
  }

  // Self dashboard view
  return (
    <div className="space-y-6">
      {/* View Mode Toggle for users with multiple modes */}
      {availableModes.length > 1 && (
        <ViewModeToggle
          currentMode={viewMode}
          availableModes={availableModes}
          onModeChange={handleModeChange}
        />
      )}

      {/* Pending Period Alert */}
      {pendingPeriods.length > 0 && (
        <div className="space-y-2">
          {pendingPeriods.map(pp => (
            <Alert key={pp.key} className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  You have <strong>{pp.count} pending KPI{pp.count > 1 ? 's' : ''}</strong> for {pp.month} {pp.year} that need your action.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
                    onClick={() => {
                      setPeriodSelection(prev => ({
                        ...prev,
                        mode: 'single',
                        selectedMonth: pp.month,
                        selectedYear: pp.year,
                        months: [pp.month],
                        periodRanges: [{ month: pp.month, year: pp.year }],
                      }));
                    }}
                  >
                    Switch to {pp.month.substring(0, 3)} {pp.year}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-amber-600 dark:text-amber-400"
                    onClick={() => setDismissedPendingPeriods(prev => [...prev, pp.key])}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* 1. Profile + Filters Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <ProfileCard
          profile={{
            full_name: profile?.full_name,
            designation: profile?.designation,
            employee_code: profile?.employee_code,
            avatar_url: profile?.avatar_url,
            email: profile?.email,
          }}
          compact
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 flex-shrink-0">
          <ReviewPeriodSelectorEnhanced
            value={periodSelection}
            onChange={setPeriodSelection}
          />
          
          <div className="h-6 w-px bg-border hidden sm:block" />
          
          <Select
            value={activeCategory}
            onValueChange={setActiveCategory}
          >
            <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All" className="text-xs">All Categories</SelectItem>
              {availableCategories.map(cat => (
                <SelectItem key={cat.id} value={cat.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cat.color || 'hsl(var(--primary))' }}
                    />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Badge variant="outline" className="text-xs h-6 px-2 ml-auto whitespace-nowrap">
            {fullyFilteredKpis.length}/{periodFilteredKpis.length} KPIs
          </Badge>
        </div>
      </div>

      {/* Cumulative Summary Card */}
      {isCumulativeMode && cumulativeMetrics && (
        <CumulativeSummaryCard
          periodSelection={periodSelection}
          avgScore={cumulativeMetrics.score}
          trend={cumulativeMetrics.trend}
          completedCount={cumulativeMetrics.completedKpis}
          totalCount={cumulativeMetrics.totalKpis}
          pendingCount={cumulativeMetrics.pendingKpis}
        />
      )}

      {/* 2. Performance Charts Row */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-6">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {isCumulativeMode ? 'Avg' : 'Overall'}
            </CardTitle>
            <CardDescription className="text-xs">Performance</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="h-[120px] sm:h-[140px] w-full">
              <OverallScoreChart 
                percentage={metrics.overallPercentage} 
                rating={metrics.overallRating}
              />
            </div>
            <div className="text-center mt-2 pt-2 border-t border-border w-full">
              <p className="text-xs text-muted-foreground">
                {isCumulativeMode ? 'Avg Score' : 'Weighted Score'}
              </p>
              {isCumulativeMode ? (
                <p className="text-lg font-bold text-foreground">
                  {metrics.overallRating.toFixed(1)} <span className="text-muted-foreground font-normal">/ 5</span>
                </p>
              ) : (
                <p className="text-lg font-bold text-foreground">
                  {metrics.totalScore.toFixed(1)} <span className="text-muted-foreground font-normal">/ {metrics.totalMaxScore.toFixed(0)}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Category</CardTitle>
            <CardDescription className="text-xs">Score breakdown across KRA categories</CardDescription>
          </CardHeader>
          <CardContent style={{ height: Math.max(180, categoryMetrics.length * 36) }}>
            <CategoryScoreChart data={categoryMetrics} sortBy={categorySortBy} onSortChange={setCategorySortBy} />
          </CardContent>
        </Card>
      </div>

      {/* 5. Status Progress */}
      <WorkflowProgressTracker 
        kpis={periodFilteredKpis}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        workflowStages={selfWorkflowStages}
      />

      {/* 6. KPI Details */}
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Detailed KPI Review</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {sortedKpis.length} KPIs {activeCategory !== 'All' ? `in ${activeCategory}` : ''} for {selectedPeriod} {selectedYear}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <KraExportMenu
                kpis={periodFilteredKpis}
                employeeProfile={{
                  full_name: profile?.full_name,
                  employee_code: profile?.employee_code,
                  designation: profile?.designation,
                }}
                department="-"
                period={selectedPeriod}
                year={selectedYear}
              />
              {isMobile 
                ? <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} compact />
                : <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} />
              }
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="space-y-3">
              {sortedKpis.map(kpi => (
                <MobileKpiCard
                  key={kpi.id}
                  kpi={kpi}
                  submission={submissionMap.get(kpi.id)}
                  statusColors={statusColors}
                  statusLabels={statusLabels}
                  orgKpiValue={kpi.is_org_level ? getOrgKpiValue(kpi) : undefined}
                  auditAssignment={isAuditCapable ? (auditKpiAssignments?.get(kpi.id) || null) : undefined}
                  isAuditCapable={isAuditCapable}
                  onViewLogic={setSelectedKpiLogic}
                  onViewTracker={setSelectedKpiTracker}
                  onReview={(kpi) => {
                    setAutoOpenQueryHistory(false);
                    setSelectedKpiReview(kpi);
                  }}
                />
              ))}
              {sortedKpis.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No KPIs found for the selected filters
                </div>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>KRA / KPI</TableHead>
                  <TableHead className="text-center">Target</TableHead>
                  <TableHead className="text-center">Weightage</TableHead>
                  <TableHead className="text-center">Achieved</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedKpis.map(kpi => {
                  const submission = submissionMap.get(kpi.id);
                  
                  const score = submission?.final_score ?? submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? null;
                  
                  return (
                    <TableRow key={kpi.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: kpi.kra_categories?.color }}
                          />
                          <span className="text-sm">{kpi.kra_categories?.name}</span>
                          {kpi.is_org_level && (() => {
                            const scope = (kpi as any).org_level_scope || 'employee';
                            return (
                              <Tooltip>
                                <TooltipTrigger>
                                  {scope === 'organization' ? (
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                  ) : scope === 'department' ? (
                                    <Users className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <User className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Organization-level KPI ({scope} scope)</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-foreground">{kpi.kra_name}</p>
                          <p className="text-sm text-muted-foreground">{kpi.kpi_name}</p>
                          <FrequencyLockBadge
                            frequency={kpi.frequency}
                            reviewMonth={selectedPeriod}
                            reviewYear={selectedYear}
                            frequencyCycleStart={kpi.frequency_cycle_start}
                          />
                          {kpi.is_org_level && (() => {
                            const scope = (kpi as any).org_level_scope || 'employee';
                            const orgVal = getOrgKpiValue(kpi);
                            return (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                                  {scope === 'organization' ? (
                                    <Building2 className="h-2.5 w-2.5" />
                                  ) : scope === 'department' ? (
                                    <Users className="h-2.5 w-2.5" />
                                  ) : (
                                    <User className="h-2.5 w-2.5" />
                                  )}
                                  Org KPI — {scope.charAt(0).toUpperCase() + scope.slice(1)}
                                </Badge>
                                {orgVal?.entered_by_name && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Data by: {orgVal.entered_by_name}
                                  </Badge>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {kpi.target_value}
                        {kpi.uom && <span className="text-xs text-muted-foreground ml-1">({kpi.uom})</span>}
                      </TableCell>
                      <TableCell className="text-center font-medium">{kpi.weightage}%</TableCell>
                      <TableCell className="text-center font-semibold">
                        {submission?.achieved_value != null ? submission.achieved_value : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {score != null ? (
                          <Badge className={getScoreBadgeClass(score)}>
                            {score.toFixed(1)}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Badge className={statusColors[kpi.status]}>
                            {statusLabels[kpi.status]}
                          </Badge>
                          {isAuditCapable && (
                            <AuditKpiAssignPopover
                              kpiId={kpi.id}
                              currentAssignment={auditKpiAssignments?.get(kpi.id) || null}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={kpi.status === 'kra_set' ? "default" : "ghost"}
                                onClick={() => {
                                  setAutoOpenQueryHistory(false);
                                  setSelectedKpiReview(kpi);
                                }}
                                className={kpi.status === 'kra_set' ? "gap-1" : ""}
                              >
                                {kpi.status === 'kra_set' ? (
                                  <>
                                    <ClipboardEdit className="h-4 w-4" />
                                    Review
                                  </>
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {kpi.status === 'kra_set' ? 'Submit self review' : 'View Details'}
                            </TooltipContent>
                          </Tooltip>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedKpiLogic(kpi)}
                            title="View Rating Logic"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedKpiTracker(kpi)}
                            title="View Tracker"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sortedKpis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No KPIs found for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Self Review Sheet - Opens for both submit and view */}
      <SelfReviewSheet
        open={!!selectedKpiReview}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedKpiReview(null);
            setAutoOpenQueryHistory(false);
          }
        }}
        kpi={selectedKpiReview}
        allKpis={kpis || []}
        submissionMap={submissionMap}
        allSubmissions={allSubmissions || []}
        subPeriodSubmissions={subPeriodSubmissions || []}
        subPeriodLoading={subPeriodLoading}
        orgKpiValuesMap={orgKpiValuesMap}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        autoOpenQueryHistory={autoOpenQueryHistory}
      />

      {/* Modals */}
      <KpiTrackerModal
        isOpen={!!selectedKpiTracker}
        onClose={() => setSelectedKpiTracker(null)}
        kpi={selectedKpiTracker}
        allKpis={kpis || []}
        submissions={submissions || []}
      />

      <KpiLogicModal
        isOpen={!!selectedKpiLogic}
        onClose={() => setSelectedKpiLogic(null)}
        kpi={selectedKpiLogic}
      />

      {mentionedKpi && (
        <MentionedKpiSheet
          kpiId={mentionedKpi.kpiId}
          employeeId={mentionedKpi.employeeId}
          open={!!mentionedKpi}
          onOpenChange={(open) => { if (!open) setMentionedKpi(null); }}
        />
      )}
    </div>
  );
}

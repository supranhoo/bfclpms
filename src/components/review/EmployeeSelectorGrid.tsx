import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUrlFilterState, useUrlFilterStateNullable, useClearAllFilters } from '@/hooks/useUrlFilterState';
import { useMyAuditAssignments } from '@/hooks/useAuditAssignments';
import { useMyKpiLevelAssignments } from '@/hooks/useMyKpiLevelAssignments';
import { useAuditorWorkloadSummary } from '@/hooks/useAuditorWorkloadSummary';
import { AuditAssignmentDialog } from '@/components/admin/AuditAssignmentDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, useProfiles, useSkipLevelTeamMembers, useProfilesByWorkflowStage } from '@/hooks/useOrganization';
import { useKpisByPeriodRanges, useReviewSubmissionScoresByKpiIds, KPI } from '@/hooks/useKpis';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import { useEmployeeScoresForPeriod } from '@/hooks/useEmployeeScoresForPeriod';
import { resolvePendingStatuses, resolveReviewableStatuses, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { getScoreBadgeClass } from '@/lib/reviewConstants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { EmployeeFilters } from '@/components/review/EmployeeFilters';
import { EmployeeContactCard } from '@/components/review/EmployeeContactCard';
import { supabase } from '@/integrations/supabase/client';
import { formatEmployeeName } from '@/lib/utils';
import { Users, CheckCircle2, Clock, ArrowRight, Target, Shield, Briefcase, FileCheck, UserCheck, ClipboardCheck, Settings2, Download, ChevronDown, ChevronUp, Loader2, Info, Eye, AlertTriangle, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ViewMode } from './ViewModeToggle';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  pms_grade?: string | null;
  mobile_number?: string | null;
  relationship?: 'direct' | 'indirect';
  departments?: { id: string; name: string; code: string | null } | null;
}

interface EmployeeSelectorGridProps {
  viewLevel: Exclude<ViewMode, 'self'>;
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
  onSelectEmployee: (employee: EmployeeProfile, autoOpenKpiId?: string | null) => void;
}

// Status options per view level
const STATUS_OPTIONS_BY_LEVEL: Record<Exclude<ViewMode, 'self'>, Array<{ value: string; label: string }>> = {
  team: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending_direct', label: 'Pending (Direct)' },
    { value: 'pending_skip', label: 'Pending (Skip-Level)' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  skip_level: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Skip-Level Review' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  hr_pms: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Review' },
    { value: 'in_review', label: 'In HR PMS Review' },
    { value: 'reviewed', label: 'Reviewed' },
  ],
  audit: [
    { value: 'all', label: 'All Employees' },
    { value: 'my_assigned', label: 'My Assignments' },
    { value: 'pending', label: 'With Pending Audit' },
    { value: 'in_audit', label: 'In Audit' },
    { value: 'forwarded', label: 'Forwarded' },
    { value: 'cross_check', label: 'All Employees (Cross-Check)' },
  ],
  management: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'With Pending Reviews' },
    { value: 'approved', label: 'Approved' },
    { value: 'cross_check', label: 'All Employees (Cross-Check)' },
  ],
  pending_self_review: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Self Review' },
  ],
  pending_manager_review: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Manager Review' },
  ],
  pending_skip_review: [
    { value: 'all', label: 'All Employees' },
    { value: 'pending', label: 'Pending Skip Mgr Review' },
  ],
};

// Header config per view level
const HEADER_CONFIG: Record<Exclude<ViewMode, 'self'>, { icon: React.ElementType; title: string; description: string; gradient: string }> = {
  team: { 
    icon: Users, 
    title: 'Team Reviews', 
    description: "Review direct & indirect reports' performance",
    gradient: 'from-blue-500 to-indigo-600'
  },
  skip_level: { 
    icon: UserCheck, 
    title: 'Team Reviews', 
    description: 'Review as skip-level reporting manager',
    gradient: 'from-teal-500 to-cyan-600'
  },
  hr_pms: { 
    icon: ClipboardCheck, 
    title: 'HR PMS Review', 
    description: 'HR PMS team review and assessment',
    gradient: 'from-rose-500 to-pink-600'
  },
  audit: { 
    icon: Shield, 
    title: 'Audit Panel', 
    description: 'Review and verify performance evaluations',
    gradient: 'from-purple-500 to-indigo-600'
  },
  management: { 
    icon: Briefcase, 
    title: 'Management Review', 
    description: 'Final review and approval of performance evaluations',
    gradient: 'from-emerald-500 to-teal-600'
  },
  pending_self_review: {
    icon: Users,
    title: 'Pending Self Review',
    description: 'Employees with KPIs pending self review',
    gradient: 'from-yellow-500 to-amber-600'
  },
  pending_manager_review: {
    icon: Users,
    title: 'Pending Manager Review',
    description: 'Employees with KPIs pending manager review',
    gradient: 'from-amber-500 to-orange-600'
  },
  pending_skip_review: {
    icon: UserCheck,
    title: 'Pending Skip Mgr Review',
    description: 'Employees with KPIs pending skip-level review',
    gradient: 'from-orange-500 to-red-600'
  },
};

export function EmployeeSelectorGrid({
  viewLevel,
  periodSelection,
  onPeriodSelectionChange,
  onSelectEmployee,
}: EmployeeSelectorGridProps) {
  const { user, effectiveRole: role } = useAuth();
  const queryClient = useQueryClient();
  const clearAllFilters = useClearAllFilters();
  // Track in-flight fetches for the data this grid depends on so the refresh
  // button can show a spinner and stay disabled until refetches settle.
  const fetchingProfiles = useIsFetching({ queryKey: ['profiles-by-workflow-stage'] });
  const fetchingKpis = useIsFetching({ queryKey: ['kpis-by-period-ranges'] });
  // v2.66.10.6 — query key fix: actual key is `review-submission-scores-by-kpi-ids`.
  const fetchingSubmissionScores = useIsFetching({ queryKey: ['review-submission-scores-by-kpi-ids'] });
  const fetchingProfilesAll = useIsFetching({ queryKey: ['profiles'] });
  const fetchingTeam = useIsFetching({ queryKey: ['team-members'] });
  const fetchingSkip = useIsFetching({ queryKey: ['skip-level-team-members'] });
  const isRefreshing =
    fetchingProfiles + fetchingKpis + fetchingSubmissionScores +
    fetchingProfilesAll + fetchingTeam + fetchingSkip > 0;

  // Refresh handler — invalidates every dataset feeding the reviewer grid.
  // Per POLICY.md §103, refresh actions rely on the inline button spinner only;
  // the centered overlay is reserved for page navigation / initial loads.
  const handleRefresh = useCallback(() => {
    // Invalidate every dataset feeding the reviewer grid: employee lists,
    // KPI rows for the period, and per-stage submission scores. Scoped by
    // queryKey prefix so unrelated caches stay warm.
    [
      'profiles-by-workflow-stage',
      'kpis-by-period-ranges',
      'review-submission-scores-by-kpi-ids',
      'profiles',
      'team-members',
      'skip-level-team-members',
      'employee-scores-for-period',
      'bulk-employee-workflows',
      'employee-filter-options',
      'auditor-workload-summary',
      'my-audit-assignments',
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  }, [queryClient]);

  const { data: teamMembers, isLoading: teamLoading, isError: teamError, refetch: refetchTeam } = useTeamMembers(user?.id);
  const { data: allProfiles, isLoading: profilesLoading, isError: profilesError, refetch: refetchProfiles } = useProfiles();
  // Fetch skip-level members for team view (merged) or standalone skip_level view
  const { data: skipLevelMembers, isLoading: skipLevelLoading, isError: skipError, refetch: refetchSkip } = useSkipLevelTeamMembers(
    (viewLevel === 'team' || viewLevel === 'skip_level') ? user?.id : undefined
  );

  // Map each reviewer panel to the workflow stage it requires employees to have
  const PANEL_REQUIRED_STAGE: Partial<Record<Exclude<ViewMode, 'self'>, string>> = {
    hr_pms: 'hr_pms_review',
    audit: 'audit',
    management: 'management_review',
    skip_level: 'skip_level_check',
    pending_self_review: 'self_review',
    pending_manager_review: 'manager_check',
    pending_skip_review: 'skip_level_check',
  };
  const requiredStage = PANEL_REQUIRED_STAGE[viewLevel] ?? null;

  // Fetch only employees whose resolved workflow template includes the required stage
  const selectedPeriodForFilter = periodSelection.selectedMonth;
  const selectedYearForFilter = periodSelection.selectedYear;
  const { data: stageFilteredProfiles, isLoading: stageFilteredLoading, isError: stageFilteredError, refetch: refetchStageFiltered } = useProfilesByWorkflowStage(requiredStage, selectedPeriodForFilter, selectedYearForFilter);

  // Lazy-load PMS Grades only after the user opens the "More filters" popover
  // (or if a grade is already preset via URL ?grade=...)
  const [gradesEnabled, setGradesEnabled] = useState<boolean>(false);
  const { departments, designations, grades, managers } = useEmployeeFilterOptions({
    enabledGrades: gradesEnabled,
  });

  // v2.64.9 — Roster resolution diagnostics surfaced from useProfilesByWorkflowStage __meta
  const { toast } = useToast();
  const rosterMeta = (stageFilteredProfiles as any)?.__meta as
    | { totalEligiblePool: number; seededFromKpis: number; fallbackUsed: boolean }
    | undefined;
  const fallbackToastFiredRef = useRef(false);
  useEffect(() => {
    if (!rosterMeta?.fallbackUsed || fallbackToastFiredRef.current) return;
    fallbackToastFiredRef.current = true;
    toast({
      title: 'Roster loaded from fallback source',
      description: 'Some workflow data could not be resolved. Refresh if employees appear missing.',
      variant: 'default',
    });
  }, [rosterMeta?.fallbackUsed, toast]);
  const [searchParams] = useSearchParams();
  const autoOpenKpiId = searchParams.get('kpi');

  // Derived values from period selection
  const selectedPeriod = periodSelection.selectedMonth;
  const selectedYear = periodSelection.selectedYear;

  // Persist filters in URL search params so they survive refresh/navigation
  const [searchQuery, setSearchQuery] = useUrlFilterState('q', '');
  const [statusFilter, setStatusFilter] = useUrlFilterState('status', 'all');
  const [selectedDepartment, setSelectedDepartment] = useUrlFilterStateNullable('dept');
  const [selectedDesignation, setSelectedDesignation] = useUrlFilterStateNullable('desig');
  const [selectedGrade, setSelectedGrade] = useUrlFilterStateNullable('grade');
  // Auto-enable grade fetching when a grade is already preset via URL
  useEffect(() => {
    if (selectedGrade && !gradesEnabled) setGradesEnabled(true);
  }, [selectedGrade, gradesEnabled]);
  const [selectedManager, setSelectedManager] = useUrlFilterStateNullable('mgr');
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [auditorFilter, setAuditorFilter] = useUrlFilterStateNullable('auditor');
  const [auditorWorkloadExpanded, setAuditorWorkloadExpanded] = useState(true);

  // Pagination state — windowed rendering for large reviewer grids (>2500 employees).
  // Search/sort/filter still operate on the FULL set; only the rendered slice is windowed.
  const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];
  const [page, setPage] = useUrlFilterState('page', '1');
  const [pageSizeStr, setPageSizeStr] = useUrlFilterState('size', '24');
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(parseInt(pageSizeStr, 10)) ? parseInt(pageSizeStr, 10) : 24;

  // Audit assignments: fetch current user's assigned employees
  const { data: myAssignedEmployeeIds } = useMyAuditAssignments();
  const { data: myKpiLevelData } = useMyKpiLevelAssignments();

  // Auditor workload summary (only for audit view)
  const { data: auditorWorkloadMap } = useAuditorWorkloadSummary(viewLevel === 'audit');

  // Fix 1 & 3: Use multi-period hook so YTD/QTD/custom modes fetch ALL relevant months
  const { data: periodKpis, isError: periodKpisError, refetch: refetchPeriodKpis } = useKpisByPeriodRanges(periodSelection.periodRanges);

  // BUG-020 (v2.66.7.21): reviewer-stage scores live on review_submissions,
  // not on kpis. Fetch a slim score-signature map keyed by kpi_id so HR PMS /
  // Audit / Management dashboards can detect "reviewed at this stage".
  const periodKpiIds = useMemo(() => (periodKpis || []).map(k => k.id), [periodKpis]);
  const { data: submissionScoreMap, isError: submissionScoresError, refetch: refetchSubmissionScores } =
    useReviewSubmissionScoresByKpiIds(periodKpiIds);

  // Compute overall weighted scores per employee for this period
  const employeeScoreMap = useEmployeeScoresForPeriod(periodKpis, submissionScoreMap);

  const isFullAccess = role === 'admin' || role === 'auditor' || role === 'management' || role === 'hr_pms';

  // ADR-063 RCA — diagnostic for Vivek's empty Team Reviews. Will be removed
  // once the failing branch is identified.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[TeamReviews RCA]', {
      role,
      isFullAccess,
      viewLevel,
      allProfiles_len: allProfiles?.length ?? null,
      teamMembers_len: teamMembers?.length ?? null,
      skipLevelMembers_len: skipLevelMembers?.length ?? null,
      requiredStage,
      statusFilter,
      profilesLoading,
      teamLoading,
    });
  }, [role, isFullAccess, viewLevel, allProfiles, teamMembers, skipLevelMembers, requiredStage, statusFilter, profilesLoading, teamLoading]);

  // Fix 2: Derive employee IDs from the full visible list, not just periodKpis.
  // This ensures workflowMap has stages for ALL panel employees, not only those with KPIs in the selected range.
  const allEmployeeIds = useMemo(() => {
    if (viewLevel === 'team' && !isFullAccess) {
      // Merge direct + indirect IDs so workflowMap covers all visible employees
      const directIds = (teamMembers || []).map(p => p.id);
      const indirectIds = (skipLevelMembers || []).map(p => p.id);
      return [...new Set([...directIds, ...indirectIds])];
    }
    // Cross-check mode: include ALL profiles so workflowMap covers everyone
    const isCrossCheck = (viewLevel === 'audit' || viewLevel === 'management') && statusFilter === 'cross_check';
    const source = isCrossCheck ? allProfiles : (requiredStage ? stageFilteredProfiles : (isFullAccess ? allProfiles : teamMembers));
    if (!source) return [];
    return source.map((p: { id: string }) => p.id);
  }, [viewLevel, requiredStage, stageFilteredProfiles, isFullAccess, allProfiles, teamMembers, skipLevelMembers]);

  const { data: workflowMap } = useBulkEmployeeWorkflows(allEmployeeIds, selectedPeriod, selectedYear);

  // Helper: get workflow stages for an employee (with fallback)
  const getStages = (employeeId: string): string[] => {
    return workflowMap?.get(employeeId) || DEFAULT_WORKFLOW_STAGES;
  };

  // Helper: check if an employee has a resolved workflow (not just the default fallback)
  const hasResolvedWorkflow = (employeeId: string): boolean => {
    return workflowMap?.has(employeeId) ?? false;
  };

  // Helper: map viewLevel to workflow engine's viewLevel format
  const getEngineViewLevel = (forRelationship?: 'direct' | 'indirect'): 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' => {
    // In merged team view, indirect reports use skip_level engine level
    if (viewLevel === 'team' && forRelationship === 'indirect') return 'skip_level';
    const map: Record<string, 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms'> = {
      team: 'manager',
      skip_level: 'skip_level',
      hr_pms: 'hr_pms',
      audit: 'auditor',
      management: 'management',
      pending_self_review: 'hr_pms',
      pending_manager_review: 'hr_pms',
      pending_skip_review: 'hr_pms',
    };
    return map[viewLevel] || 'manager';
  };

  // isLoading accounts for stage-filtered fetch when a required stage is active
  const isExplorerCapable = viewLevel === 'audit' || viewLevel === 'management';
  const isCrossCheckMode = isExplorerCapable && statusFilter === 'cross_check';
  // v2.65.0 — Explorer Mode (auditor + management read-only org-wide browse).
  // Treat Explorer Mode as a UI-level alias of cross_check; auto-applies when
  // ?explore=1 is in the URL or when the user toggles the pill.
  const exploreParam = searchParams.get('explore');
  const isExploreMode = isExplorerCapable && (statusFilter === 'cross_check' || exploreParam === '1');
  // Auto-promote to cross_check when ?explore=1 is set but status filter hasn't caught up yet
  useEffect(() => {
    if (isExplorerCapable && exploreParam === '1' && statusFilter !== 'cross_check') {
      setStatusFilter('cross_check');
    }
  }, [isExplorerCapable, exploreParam, statusFilter, setStatusFilter]);
  const isLoading = viewLevel === 'team'
    ? (isFullAccess ? profilesLoading : (teamLoading || skipLevelLoading))
    : isCrossCheckMode
      ? profilesLoading
      : requiredStage
        ? stageFilteredLoading
        : (isFullAccess ? profilesLoading : teamLoading);

  // Build merged base members with relationship tags for team view.
  //
  // BUG-036 / POLICY §107 — Reviewer Self-Exclusion.
  // No reviewer panel (Team, Audit, HR PMS, Management, Skip-Level, Pending-*,
  // cross-check) may surface the viewer's own profile. Self-assessment lives
  // exclusively under the Self tab. We strip the viewer (`user.id`) from the
  // resolved member list at the very last step so every branch is covered
  // (including admin / management / hr_pms / auditor running through Team).
  const baseMembers: EmployeeProfile[] | undefined = useMemo(() => {
    let resolved: EmployeeProfile[] | undefined;
    if (viewLevel === 'team') {
      if (isFullAccess) {
        // Admin/auditor/management see all profiles; tag based on reporting chain
        const skipIds = new Set(skipLevelMembers?.map(m => m.id) || []);
        const directIds = new Set(teamMembers?.map(m => m.id) || []);
        resolved = allProfiles?.map(p => ({
          ...p,
          relationship: (skipIds.has(p.id) ? 'indirect' : directIds.has(p.id) ? 'direct' : undefined) as 'direct' | 'indirect' | undefined,
        }));
      } else {
        // Manager: merge direct + indirect
        const directSet = new Set(teamMembers?.map(m => m.id) || []);
        const directTagged = (teamMembers || []).map(m => ({ ...m, relationship: 'direct' as const }));
        const indirectTagged = (skipLevelMembers || []).filter(m => !directSet.has(m.id)).map(m => ({ ...m, relationship: 'indirect' as const }));
        resolved = [...directTagged, ...indirectTagged];
      }
    } else if ((viewLevel === 'audit' || viewLevel === 'management') && statusFilter === 'cross_check') {
      // Cross-check mode: bypass workflow stage filter, show ALL employees
      resolved = (allProfiles as EmployeeProfile[] | undefined) || [];
    } else if (requiredStage) {
      // For reviewer panels (hr_pms, audit, management, skip_level):
      // Only show employees whose resolved workflow template includes the required stage.
      resolved = (stageFilteredProfiles as EmployeeProfile[] | undefined) || [];
    } else if (isFullAccess) {
      resolved = allProfiles;
    } else {
      resolved = teamMembers;
    }
    // POLICY §107 — strip the viewer from every reviewer panel.
    if (!resolved || !user?.id) return resolved;
    return resolved.filter(m => m.id !== user.id);
  }, [viewLevel, teamMembers, skipLevelMembers, allProfiles, isFullAccess, requiredStage, stageFilteredProfiles, statusFilter, user?.id]);

  // Auto-open KPI from URL
  useEffect(() => {
    if (!autoOpenKpiId || !allProfiles) return;

    (async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('employee_id, review_period, review_year')
        .eq('id', autoOpenKpiId)
        .maybeSingle();

      if (error || !data) return;

      const targetEmployee = allProfiles.find(p => p.id === data.employee_id);
      if (targetEmployee) {
        if (data.review_period || data.review_year) {
          onPeriodSelectionChange({
            ...periodSelection,
            selectedMonth: data.review_period || periodSelection.selectedMonth,
            selectedYear: data.review_year || periodSelection.selectedYear,
            months: [data.review_period || periodSelection.selectedMonth],
            periodRanges: [{ month: data.review_period || periodSelection.selectedMonth, year: data.review_year || periodSelection.selectedYear }]
          });
        }
        onSelectEmployee(targetEmployee, autoOpenKpiId);
      }
    })();
  }, [autoOpenKpiId, allProfiles]);

  // Get employee KPI stats using workflow-aware resolution
  const getEmployeeKpiStats = (employeeId: string, relationship?: 'direct' | 'indirect') => {
    if (!periodKpis) return { badge1: 0, badge2: 0, badge3: 0, total: 0, clearedKraSet: 0 };
    const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
    const clearedKraSet = empKpis.filter(k => k.status !== 'kra_set').length;
    const stages = getStages(employeeId);

    if (viewLevel === 'team') {
      const isIndirect = relationship === 'indirect';
      if (isIndirect) {
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        const slIdx = stages.indexOf('skip_level_check');
        const doneStatuses = slIdx >= 0 ? stages.slice(slIdx) : [];
        const pendingKpis = empKpis.filter(k => reviewable.includes(k.status || ''));
        return {
          badge1: pendingKpis.length,
          badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
          badge3: 0,
          total: empKpis.length,
          clearedKraSet,
          orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
          nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
        };
      }
      const pendingKpis = empKpis.filter(k => k.status === 'self_review');
      return {
        badge1: pendingKpis.length,
        badge2: empKpis.filter(k => !['kra_set', 'self_review'].includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
        clearedKraSet,
        orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
        nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
      };
    } else if (viewLevel === 'skip_level') {
      const reviewable = resolveReviewableStatuses('skip_level', stages);
      const slIdx = stages.indexOf('skip_level_check');
      const doneStatuses = slIdx >= 0 ? stages.slice(slIdx) : [];
      const pendingKpis = empKpis.filter(k => reviewable.includes(k.status || ''));
      return {
        badge1: pendingKpis.length,
        badge2: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
        badge3: 0,
        total: empKpis.length,
        clearedKraSet,
        orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
        nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
      };
    } else if (viewLevel === 'hr_pms') {
      const reviewable = resolveReviewableStatuses('hr_pms', stages);
      const hrIdx = stages.indexOf('hr_pms_review');
      const doneStatuses = hrIdx >= 0 ? stages.slice(hrIdx + 1) : [];
      const pendingKpis = [...empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'hr_pms_review'), ...empKpis.filter(k => k.status === 'hr_pms_review')];
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'hr_pms_review').length,
        badge2: empKpis.filter(k => k.status === 'hr_pms_review').length,
        badge3: empKpis.filter(k => doneStatuses.includes(k.status || '')).length,
        total: empKpis.length,
        clearedKraSet,
        scoreReviewed: empKpis.filter(k => {
          const s = submissionScoreMap?.get(k.id);
          // BUG-046 (POLICY §115): N/A approvals at-or-past HR PMS count as reviewed.
          if (!s) return false;
          if (s.hr_pms_score != null) return true;
          return s.is_na === true && doneStatuses.includes(k.status || '');
        }).length,
        orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
        nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
      };
    } else if (viewLevel === 'audit') {
      const reviewable = resolveReviewableStatuses('auditor', stages);
      const pendingKpis = [...empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'audit'), ...empKpis.filter(k => k.status === 'audit')];
      const auditIdxLocal = stages.indexOf('audit');
      const auditDone = auditIdxLocal >= 0 ? stages.slice(auditIdxLocal + 1) : [];
      return {
        badge1: empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'audit').length,
        badge2: empKpis.filter(k => k.status === 'audit').length,
        badge3: empKpis.filter(k => ['management_review', 'approved'].includes(k.status || '')).length,
        total: empKpis.length,
        clearedKraSet,
        scoreReviewed: empKpis.filter(k => {
          const s = submissionScoreMap?.get(k.id);
          if (!s) return false;
          if (s.auditor_score != null) return true;
          return s.is_na === true && auditDone.includes(k.status || '');
        }).length,
        orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
        nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
      };
    } else if (viewLevel === 'pending_self_review') {
      const pendingKpis = empKpis.filter(k => k.status === 'kra_set');
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k =>
        !k.is_org_level &&
        (!k.frequency || ['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase()))
      ).length;
      return {
        badge1: regularCount,
        badge2: 0, badge3: 0, total: empKpis.length, clearedKraSet,
        orgKpiCount,
        nonMonthlyCount,
      };
    } else if (viewLevel === 'pending_manager_review') {
      const pendingKpis = empKpis.filter(k => k.status === 'self_review');
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k =>
        !k.is_org_level &&
        (!k.frequency || ['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase()))
      ).length;
      return {
        badge1: regularCount,
        badge2: 0, badge3: 0, total: empKpis.length, clearedKraSet,
        orgKpiCount,
        nonMonthlyCount,
      };
    } else if (viewLevel === 'pending_skip_review') {
      const pendingKpis = empKpis.filter(k => k.status === 'manager_check');
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k =>
        !k.is_org_level &&
        (!k.frequency || ['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase()))
      ).length;
      return {
        badge1: regularCount,
        badge2: 0, badge3: 0, total: empKpis.length, clearedKraSet,
        orgKpiCount,
        nonMonthlyCount,
      };
    } else {
      const pendingKpis = empKpis.filter(k => k.status === 'management_review');
      const approved = empKpis.filter(k => k.status === 'approved').length;
      const inPipeline = empKpis.length - pendingKpis.length - approved;
      return {
        badge1: pendingKpis.length,
        badge2: approved,
        badge3: inPipeline,
        total: empKpis.length,
        clearedKraSet,
        scoreReviewed: empKpis.filter(k => {
          const s = submissionScoreMap?.get(k.id);
          if (!s) return false;
          if (s.management_score != null) return true;
          // BUG-046: N/A KPIs already approved count as a completed Management action.
          return s.is_na === true && k.status === 'approved';
        }).length,
        orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
        nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())).length,
      };
    }
  };

  // Demographic filtering (search, department, designation, grade, manager) — used for stats
  const demographicFilteredMembers = useMemo(() => {
    let filtered = baseMembers?.filter(p => 
      p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedDepartment) {
      filtered = filtered?.filter(p => p.department_id === selectedDepartment);
    }
    if (selectedDesignation) {
      filtered = filtered?.filter(p => p.designation === selectedDesignation);
    }
    if (selectedGrade) {
      filtered = filtered?.filter(p => p.pms_grade === selectedGrade);
    }
    if (selectedManager) {
      filtered = filtered?.filter(p => p.reporting_manager_id === selectedManager);
    }

    return filtered;
  }, [baseMembers, searchQuery, selectedDepartment, selectedDesignation, selectedGrade, selectedManager]);

  // Auditor workload stats: compute pending/in-audit/forwarded per auditor + unassigned
  const { auditorWorkloadStats, unassignedStats } = useMemo(() => {
    if (viewLevel !== 'audit' || !auditorWorkloadMap || !periodKpis) return { auditorWorkloadStats: [], unassignedStats: null };

    const allAssignedEmployeeIds = new Set<string>();
    auditorWorkloadMap.forEach(entry => {
      entry.employeeIds.forEach(id => allAssignedEmployeeIds.add(id));
    });

    const stats = [...auditorWorkloadMap.entries()].map(([auditorId, entry]) => {
      const relevantKpis = periodKpis.filter(k => 
        entry.employeeIds.has(k.employee_id) || entry.kpiIds.has(k.id)
      );
      let pending = 0, inAudit = 0, forwarded = 0;
      relevantKpis.forEach(k => {
        if (!hasResolvedWorkflow(k.employee_id)) return;
        const stages = getStages(k.employee_id);
        const auditIdx = stages.indexOf('audit');
        if (auditIdx === -1) return;
        if (k.status === 'audit') inAudit++;
        else if (['management_review', 'approved'].includes(k.status || '')) forwarded++;
        else {
          const auditReviewable = resolveReviewableStatuses('auditor', stages);
          if (auditReviewable.includes(k.status || '') && k.status !== 'audit') pending++;
        }
      });
      return {
        auditorId, name: entry.auditorName, employeeCode: entry.employeeCode,
        employeeCount: entry.employeeIds.size, pending, inAudit, forwarded,
        total: pending + inAudit + forwarded,
      };
    }).sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name));

    const unassignedKpis = periodKpis.filter(k => !allAssignedEmployeeIds.has(k.employee_id));
    const unassignedEmployeeIds = new Set(unassignedKpis.map(k => k.employee_id));
    let uPending = 0, uInAudit = 0, uForwarded = 0;
    unassignedKpis.forEach(k => {
      if (!hasResolvedWorkflow(k.employee_id)) return;
      const stages = getStages(k.employee_id);
      const auditIdx = stages.indexOf('audit');
      if (auditIdx === -1) return;
      if (k.status === 'audit') uInAudit++;
      else if (['management_review', 'approved'].includes(k.status || '')) uForwarded++;
      else {
        const auditReviewable = resolveReviewableStatuses('auditor', stages);
        if (auditReviewable.includes(k.status || '') && k.status !== 'audit') uPending++;
      }
    });
    const uTotal = uPending + uInAudit + uForwarded;
    const unassigned = uTotal > 0 ? {
      employeeCount: unassignedEmployeeIds.size, pending: uPending, inAudit: uInAudit,
      forwarded: uForwarded, total: uTotal, employeeIds: unassignedEmployeeIds,
    } : null;

    return { auditorWorkloadStats: stats, unassignedStats: unassigned };
  }, [viewLevel, auditorWorkloadMap, periodKpis, workflowMap]);

  // Filter members further by status for display
  const displayMembers = useMemo(() => {
    let filtered = demographicFilteredMembers ? [...demographicFilteredMembers] : undefined;

    // Auditor filter: restrict to employees assigned to a specific auditor or unassigned
    if (viewLevel === 'audit' && auditorFilter) {
      if (auditorFilter === '__unassigned__' && unassignedStats) {
        filtered = filtered?.filter(m => unassignedStats.employeeIds.has(m.id));
      } else if (auditorFilter !== '__unassigned__' && auditorWorkloadMap) {
        const entry = auditorWorkloadMap.get(auditorFilter);
        if (entry) {
          filtered = filtered?.filter(m => entry.employeeIds.has(m.id));
        }
      }
    }

    // Status-based filtering using per-employee workflow resolution
    if (statusFilter === 'my_assigned' && viewLevel === 'audit') {
      filtered = filtered?.filter(m => 
        (myAssignedEmployeeIds instanceof Set && myAssignedEmployeeIds.has(m.id)) ||
        (myKpiLevelData?.allAssignedEmployeeIds?.has(m.id))
      );
    } else if (statusFilter === 'cross_check' && viewLevel === 'audit') {
      // Cross-check: show ALL employees, no KPI-status filtering (demographic filters still apply above)
    } else if (statusFilter === 'cross_check' && viewLevel === 'management') {
      // Management cross-check (Explorer Mode): same — no status filtering applied
    } else if (statusFilter !== 'all' && statusFilter !== 'my_assigned' && periodKpis) {
      const employeeIds = new Set<string>();
      // For merged team view, build direct + skip-level member sets for relationship detection
      const skipIds = viewLevel === 'team' ? new Set(skipLevelMembers?.map(m => m.id) || []) : new Set<string>();
      const directIds = viewLevel === 'team' ? new Set(teamMembers?.map(m => m.id) || []) : new Set<string>();
      
      periodKpis.forEach(kpi => {
        const stages = getStages(kpi.employee_id);
        const isIndirect = skipIds.has(kpi.employee_id);
        const isDirect = directIds.has(kpi.employee_id);
        const engineLevel = viewLevel === 'team' && isIndirect ? 'skip_level' as const : getEngineViewLevel();
        const reviewableStatuses = resolveReviewableStatuses(engineLevel, stages);
        
        if (viewLevel === 'team') {
          if (statusFilter === 'pending_direct' && isDirect && kpi.status === 'self_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'pending_skip' && isIndirect && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            if (isDirect && !['kra_set', 'self_review'].includes(kpi.status || '')) {
              employeeIds.add(kpi.employee_id);
            } else if (isIndirect) {
              const slIdx = stages.indexOf('skip_level_check');
              if (slIdx >= 0 && stages.slice(slIdx).includes(kpi.status || '')) {
                employeeIds.add(kpi.employee_id);
              }
            }
          }
        } else if (viewLevel === 'audit') {
          // Guard: skip employees without resolved workflows to avoid DEFAULT fallback overcounting
          if (!hasResolvedWorkflow(kpi.employee_id)) return;
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'in_audit' && kpi.status === 'audit') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'forwarded' && ['management_review', 'approved'].includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'skip_level') {
          if (statusFilter === 'pending' && reviewableStatuses.includes(kpi.status || '')) {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            const slIdx = stages.indexOf('skip_level_check');
            if (slIdx >= 0) {
              const doneStatuses = stages.slice(slIdx);
              if (doneStatuses.includes(kpi.status || '')) employeeIds.add(kpi.employee_id);
            }
          }
        } else if (viewLevel === 'hr_pms') {
          if (statusFilter === 'pending') {
            // Pending = KPIs at stages before hr_pms_review (using resolveReviewableStatuses but excluding hr_pms_review itself)
            const hrReviewable = resolveReviewableStatuses('hr_pms', stages);
            if (hrReviewable.includes(kpi.status || '') && kpi.status !== 'hr_pms_review') {
              employeeIds.add(kpi.employee_id);
            }
          } else if (statusFilter === 'in_review' && kpi.status === 'hr_pms_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'reviewed') {
            const hrIdx = stages.indexOf('hr_pms_review');
            if (hrIdx >= 0) {
              const afterHr = stages.slice(hrIdx + 1);
              if (afterHr.includes(kpi.status || '')) employeeIds.add(kpi.employee_id);
            }
          }
        } else if (viewLevel === 'pending_self_review') {
          if (statusFilter === 'pending' && kpi.status === 'kra_set') {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'pending_manager_review') {
          if (statusFilter === 'pending' && kpi.status === 'self_review') {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'pending_skip_review') {
          if (statusFilter === 'pending' && kpi.status === 'manager_check') {
            employeeIds.add(kpi.employee_id);
          }
        } else if (viewLevel === 'management') {
          if (statusFilter === 'pending' && kpi.status === 'management_review') {
            employeeIds.add(kpi.employee_id);
          } else if (statusFilter === 'approved' && kpi.status === 'approved') {
            employeeIds.add(kpi.employee_id);
          }
        }
      });
      
      filtered = filtered?.filter(m => employeeIds.has(m.id));
    }

    // Auto-sort by urgency: most pending KPIs first
    filtered?.sort((a, b) => {
      const statsA = getEmployeeKpiStats(a.id, a.relationship);
      const statsB = getEmployeeKpiStats(b.id, b.relationship);
      // Employees with 0 KPIs sink to bottom
      if (statsA.total === 0 && statsB.total > 0) return 1;
      if (statsB.total === 0 && statsA.total > 0) return -1;
      // Most pending first. For hr_pms / audit / management, in-review items
      // (badge2) are also live workload — count them in the urgency key so
      // employees actively under review don't sink behind those with only
      // tiny upstream-pending counts. (v2.64.8 — Sanjeeb 101178 fix.)
      const includeBadge2 =
        viewLevel === 'hr_pms' ||
        viewLevel === 'audit' ||
        viewLevel === 'management';
      const urgencyA = includeBadge2 ? statsA.badge1 + statsA.badge2 : statsA.badge1;
      const urgencyB = includeBadge2 ? statsB.badge1 + statsB.badge2 : statsB.badge1;
      if (urgencyB !== urgencyA) return urgencyB - urgencyA;
      // More total KPIs = higher priority
      if (statsB.total !== statsA.total) return statsB.total - statsA.total;
      // Alphabetical fallback
      return (a.full_name || '').localeCompare(b.full_name || '');
    });

    return filtered;
  }, [demographicFilteredMembers, statusFilter, periodKpis, viewLevel, workflowMap, skipLevelMembers, teamMembers, myAssignedEmployeeIds, myKpiLevelData, auditorFilter, auditorWorkloadMap, unassignedStats]);

  // Split display members into assigned/others for audit view
  const { assignedMembers, otherMembers } = useMemo(() => {
    const employeeLevelSet = (myAssignedEmployeeIds instanceof Set) ? myAssignedEmployeeIds : new Set<string>();
    const kpiLevelSet = myKpiLevelData?.allAssignedEmployeeIds || new Set<string>();
    const hasAnyAssignments = employeeLevelSet.size > 0 || kpiLevelSet.size > 0;

    if (viewLevel !== 'audit' || !hasAnyAssignments || statusFilter === 'my_assigned') {
      return { assignedMembers: [], otherMembers: displayMembers || [] };
    }
    const assigned: EmployeeProfile[] = [];
    const others: EmployeeProfile[] = [];
    (displayMembers || []).forEach(m => {
      if (employeeLevelSet.has(m.id) || kpiLevelSet.has(m.id)) assigned.push(m);
      else others.push(m);
    });
    return { assignedMembers: assigned, otherMembers: others };
  }, [displayMembers, viewLevel, myAssignedEmployeeIds, myKpiLevelData, statusFilter]);

  // Pagination derivations: total count + slice. Audit grouped view paginates the
  // combined list (assigned first, then others) so My Assignments stay on page 1.
  const isAuditGrouped = viewLevel === 'audit' && assignedMembers.length > 0 && statusFilter !== 'my_assigned';
  const totalMembers = isAuditGrouped
    ? assignedMembers.length + otherMembers.length
    : (displayMembers?.length ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;

  const pagedDisplayMembers = useMemo(
    () => (displayMembers || []).slice(sliceStart, sliceEnd),
    [displayMembers, sliceStart, sliceEnd]
  );
  const pagedAssignedMembers = useMemo(
    () => assignedMembers.slice(sliceStart, sliceEnd),
    [assignedMembers, sliceStart, sliceEnd]
  );
  const pagedOtherMembers = useMemo(() => {
    const assignedOnPage = Math.max(0, Math.min(assignedMembers.length, sliceEnd) - sliceStart);
    const remaining = pageSize - assignedOnPage;
    if (remaining <= 0) return [];
    const otherStart = Math.max(0, sliceStart - assignedMembers.length);
    return otherMembers.slice(otherStart, otherStart + remaining);
  }, [assignedMembers.length, otherMembers, sliceStart, sliceEnd, pageSize]);

  // Discoverability hint: when sorted by urgency (most-pending first), employees
  // who are fully reviewed/forwarded sink to the back pages. Surface a one-click
  // jump to filter directly to that "completed" status. Maps viewLevel → its
  // "completed" statusFilter value (matches statusOptions definitions above).
  const completedFilterForView = useMemo<string | null>(() => {
    switch (viewLevel) {
      case 'team':
      case 'skip_level':
      case 'hr_pms':
        return 'reviewed';
      case 'audit':
        return 'forwarded';
      case 'management':
        return 'approved';
      default:
        return null;
    }
  }, [viewLevel]);

  // Count of reviewed/completed employees in the CURRENT (statusFilter='all') set,
  // i.e. those with badge1 === 0 AND total > 0. Used to gate the discoverability pill.
  const reviewedOnBackPagesCount = useMemo(() => {
    if (statusFilter !== 'all' || totalPages <= 1 || !displayMembers || !completedFilterForView) return 0;
    let count = 0;
    for (const m of displayMembers) {
      const s = getEmployeeKpiStats(m.id, m.relationship);
      // v2.64.8: For hr_pms / audit / management, badge2 (in-review) is also
      // live workload, so an employee is only "fully reviewed/forwarded" when
      // both badge1 AND badge2 are zero. Otherwise the discoverability pill
      // misclassifies actively-in-review employees as "completed".
      const includeBadge2 =
        viewLevel === 'hr_pms' ||
        viewLevel === 'audit' ||
        viewLevel === 'management';
      const remaining = includeBadge2 ? s.badge1 + s.badge2 : s.badge1;
      if (s.total > 0 && remaining === 0) count++;
    }
    return count;
  }, [statusFilter, totalPages, displayMembers, completedFilterForView, getEmployeeKpiStats, viewLevel]);

  // Reset to page 1 when filters/sort/view change so users never land on an empty page.
  useEffect(() => {
    if (currentPage !== 1) setPage('1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, selectedDepartment, selectedDesignation, selectedGrade, selectedManager, auditorFilter, viewLevel, pageSize]);

  // Calculate stats using per-employee workflow-aware resolution
  const stats = useMemo(() => {
    if (!periodKpis || !demographicFilteredMembers) {
      return { totalEmployees: 0, stat1: 0, stat2: 0, stat3: 0, stat4: 0, stat5: 0, totalKpis: 0 };
    }

    const memberIds = new Set(demographicFilteredMembers.map(m => m.id));
    const relevantKpis = periodKpis.filter(k => memberIds.has(k.employee_id));
    const skipIds = new Set(skipLevelMembers?.map(m => m.id) || []);
    const directIds = new Set(teamMembers?.map(m => m.id) || []);

    if (viewLevel === 'team') {
      // Merged view: separate direct pending, skip-level pending, and reviewed counts
      let directPending = 0, skipPending = 0, reviewed = 0;
      relevantKpis.forEach(k => {
        const isIndirect = skipIds.has(k.employee_id);
        const isDirect = directIds.has(k.employee_id);
        if (isIndirect) {
          const stages = getStages(k.employee_id);
          const reviewable = resolveReviewableStatuses('skip_level', stages);
          if (reviewable.includes(k.status || '')) skipPending++;
          else {
            const slIdx = stages.indexOf('skip_level_check');
            if (slIdx >= 0 && stages.slice(slIdx).includes(k.status || '')) reviewed++;
          }
        } else if (isDirect) {
          if (k.status === 'self_review') directPending++;
          else if (!['kra_set', 'self_review'].includes(k.status || '')) reviewed++;
        }
        // Employees with no reporting relationship (undefined) are excluded from direct/skip counts
      });
      return {
        totalEmployees: demographicFilteredMembers.length,
        stat1: directPending,
        stat2: skipPending,
        stat3: reviewed,
        stat4: relevantKpis.length,
        stat5: 0,
        totalKpis: relevantKpis.length,
      };
    } else if (viewLevel === 'audit') {
      let pending = 0, inAudit = 0, forwarded = 0;
      const periodEmployeeIds = new Set<string>();
      let reviewed = 0;
      relevantKpis.forEach(k => {
        // v2.64.11: Total Employees = ANY employee with KPIs in this period
        // whose workflow includes the audit stage (not just those at/before audit).
        periodEmployeeIds.add(k.employee_id);
        // BUG-046: count audit-signature BEFORE workflow guards so historical
        // signatures still contribute to "Auditor Reviewed".
        const auditSubEarly = submissionScoreMap?.get(k.id);
        if (auditSubEarly) {
          if (auditSubEarly.auditor_score != null) reviewed++;
          else if (auditSubEarly.is_na === true && ['management_review', 'approved'].includes(k.status || '')) reviewed++;
        }
        // Guard: skip employees without resolved workflows to avoid DEFAULT_WORKFLOW_STAGES fallback overcounting
        if (!hasResolvedWorkflow(k.employee_id)) return;
        const stages = getStages(k.employee_id);
        const auditIdx = stages.indexOf('audit');
        if (auditIdx === -1) return;
        if (k.status === 'audit') { inAudit++; }
        else if (['management_review', 'approved'].includes(k.status || '')) { forwarded++; }
        else {
          const auditReviewable = resolveReviewableStatuses('auditor', stages);
          if (auditReviewable.includes(k.status || '') && k.status !== 'audit') {
            pending++;
          }
        }
      });
      // v2.64.11: Total Employees = unique employees with any KPI in period
      // (workflow-filtered roster); reviewed counted via audit_score signature.
      return { totalEmployees: periodEmployeeIds.size, stat1: pending, stat2: inAudit, stat3: forwarded, stat4: reviewed, stat5: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'skip_level') {
      let pending = 0, reviewed = 0;
      const periodEmployeeIds = new Set<string>();
      relevantKpis.forEach(k => {
        periodEmployeeIds.add(k.employee_id);
        const stages = getStages(k.employee_id);
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        if (reviewable.includes(k.status || '')) pending++;
        else {
          const slIdx = stages.indexOf('skip_level_check');
          if (slIdx >= 0 && stages.slice(slIdx).includes(k.status || '')) reviewed++;
        }
      });
      return { totalEmployees: periodEmployeeIds.size, stat1: pending, stat2: reviewed, stat3: relevantKpis.length, stat4: 0, stat5: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'hr_pms') {
      let pending = 0, inReview = 0, forwarded = 0;
      const periodEmployeeIds = new Set<string>();
      let reviewed = 0;
      relevantKpis.forEach(k => {
        // v2.64.11: Count any employee with at least one KPI in period.
        periodEmployeeIds.add(k.employee_id);
        // BUG-046: count HR PMS reviewed signatures (incl. N/A approvals)
        // BEFORE workflow guards so historically-scored KPIs still contribute.
        const hrSubEarly = submissionScoreMap?.get(k.id);
        if (hrSubEarly) {
          if (hrSubEarly.hr_pms_score != null) reviewed++;
          else if (hrSubEarly.is_na === true) {
            const stagesForK = getStages(k.employee_id);
            const hrIdxK = stagesForK.indexOf('hr_pms_review');
            // Treat N/A as reviewed once the KPI has moved past the HR PMS stage,
            // OR if the KPI is already terminal (approved) on a workflow without HR PMS.
            const past = hrIdxK >= 0 && stagesForK.slice(hrIdxK + 1).includes(k.status || '');
            if (past || k.status === 'approved') reviewed++;
          }
        }
        const stages = getStages(k.employee_id);
        const hrIdx = stages.indexOf('hr_pms_review');
        if (hrIdx === -1) return;
        if (k.status === 'hr_pms_review') { inReview++; }
        else {
          const hrReviewable = resolveReviewableStatuses('hr_pms', stages);
          if (hrReviewable.includes(k.status || '') && k.status !== 'hr_pms_review') {
            pending++;
          }
          const afterHr = stages.slice(hrIdx + 1);
          if (afterHr.includes(k.status || '')) { forwarded++; }
        }
      });
      // v2.64.11: Total Employees = unique employees with any KPI in period
      // (workflow-filtered roster). Stat3 = reviewed via hr_pms_score signature.
      return { totalEmployees: periodEmployeeIds.size, stat1: pending, stat2: inReview, stat3: reviewed, stat4: relevantKpis.length, stat5: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'pending_self_review') {
      const pendingKpis = relevantKpis.filter(k => k.status === 'kra_set');
      const pendingCount = pendingKpis.length;
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k => !k.is_org_level && (!k.frequency || ['monthly','daily','weekly'].includes(k.frequency.toLowerCase()))).length;
      return { totalEmployees: demographicFilteredMembers.length, stat1: regularCount, stat2: orgKpiCount, stat3: nonMonthlyCount, stat4: 0, stat5: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'pending_manager_review') {
      const pendingKpis = relevantKpis.filter(k => k.status === 'self_review');
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k => !k.is_org_level && (!k.frequency || ['monthly','daily','weekly'].includes(k.frequency.toLowerCase()))).length;
      return { totalEmployees: demographicFilteredMembers.length, stat1: regularCount, stat2: orgKpiCount, stat3: nonMonthlyCount, stat4: 0, stat5: 0, totalKpis: relevantKpis.length };
    } else if (viewLevel === 'pending_skip_review') {
      const pendingKpis = relevantKpis.filter(k => k.status === 'manager_check');
      const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
      const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length;
      const regularCount = pendingKpis.filter(k => !k.is_org_level && (!k.frequency || ['monthly','daily','weekly'].includes(k.frequency.toLowerCase()))).length;
      return { totalEmployees: demographicFilteredMembers.length, stat1: regularCount, stat2: orgKpiCount, stat3: nonMonthlyCount, stat4: 0, stat5: 0, totalKpis: relevantKpis.length };
    } else {
      // Management view (default branch): Total Employees = those with at
      // v2.64.11: Total Employees = unique employees with any KPI in period
      // (workflow-filtered roster), regardless of current stage.
      const periodEmployeeIds = new Set<string>();
      let reviewed = 0;
      relevantKpis.forEach(k => {
        periodEmployeeIds.add(k.employee_id);
        const mgmtSub = submissionScoreMap?.get(k.id);
        if (mgmtSub) {
          if (mgmtSub.management_score != null) reviewed++;
          else if (mgmtSub.is_na === true && k.status === 'approved') reviewed++;
        }
      });
      return {
        totalEmployees: periodEmployeeIds.size,
        stat1: relevantKpis.filter(k => k.status === 'management_review').length,
        stat2: reviewed > 0 ? reviewed : relevantKpis.filter(k => k.status === 'approved').length,
        stat3: relevantKpis.length,
        stat4: 0,
        stat5: 0,
        totalKpis: relevantKpis.length,
      };
    }
  }, [periodKpis, demographicFilteredMembers, viewLevel, workflowMap, skipLevelMembers, teamMembers, submissionScoreMap]);



  const handleEmployeeClick = async (member: EmployeeProfile) => {
    // POLICY §107 — defense in depth. baseMembers already strips the viewer,
    // but if any future regression slips self into the list we still refuse.
    if (user?.id && member.id === user.id) {
      toast({
        title: 'Self-review not allowed here',
        description: 'Use the Self tab to view or score your own KPIs.',
        variant: 'destructive',
      });
      return;
    }
    // BUG-035 / POLICY §106 — stage-gate guard. Block opening employees whose
    // resolved workflow does not include the reviewer's required stage so the
    // forward-action toast never has to fire.
    if (requiredStage && !isCrossCheckMode && workflowMap?.has(member.id)) {
      const stages = workflowMap.get(member.id) || [];
      if (!stages.includes(requiredStage)) {
        toast({
          title: 'Workflow stage missing',
          description: `${member.full_name || 'This employee'}'s workflow does not include the "${requiredStage}" stage.`,
          variant: 'destructive',
        });
        return;
      }
    }
    const empKpis = periodKpis?.filter(k => k.employee_id === member.id) || [];
    
    if (empKpis.length > 0) {
      // Employee has KPIs in the currently selected period
      onSelectEmployee(member);
      return;
    }

    // No KPIs in current period — find the most recent period with KPIs
    const { data, error } = await supabase
      .from('kpis')
      .select('review_period, review_year')
      .eq('employee_id', member.id)
      .order('review_year', { ascending: false })
      .order('review_period', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.review_period && data?.review_year) {
      onPeriodSelectionChange({
        ...periodSelection,
        selectedMonth: data.review_period,
        selectedYear: data.review_year,
        months: [data.review_period],
        periodRanges: [{ month: data.review_period, year: data.review_year }],
        // Capture the user's original panel selection so reviewer scorecards
        // can disclose the auto-switch via PeriodAutoSwitchBanner.
        autoSwitchedFrom: {
          month: periodSelection.selectedMonth,
          year: periodSelection.selectedYear,
        },
      });
    }

    onSelectEmployee(member);
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId || !allProfiles) return null;
    const mgr = allProfiles.find(p => p.id === managerId);
    if (!mgr) return null;
    return formatEmployeeName(mgr.full_name, mgr.email, mgr.employee_code);
  };

  // --- Export Pending KPIs to Excel ---
  const handleExportPendingKpis = () => {
    if (!periodKpis || !displayMembers || displayMembers.length === 0) return;

    const profileMap = new Map((allProfiles || []).map(p => [p.id, p]));
    const deptMap = new Map((departments || []).map(d => [d.id, d.name]));
    const skipIds = new Set(skipLevelMembers?.map(m => m.id) || []);

    const getPendingKpis = (employeeId: string, relationship?: 'direct' | 'indirect'): KPI[] => {
      const empKpis = periodKpis.filter(k => k.employee_id === employeeId);
      const stages = getStages(employeeId);

      if (viewLevel === 'pending_self_review') return empKpis.filter(k => k.status === 'kra_set');
      if (viewLevel === 'pending_manager_review') return empKpis.filter(k => k.status === 'self_review');
      if (viewLevel === 'pending_skip_review') return empKpis.filter(k => k.status === 'manager_check');
      if (viewLevel === 'team') {
        const isIndirect = relationship === 'indirect' || skipIds.has(employeeId);
        if (isIndirect) {
          const reviewable = resolveReviewableStatuses('skip_level', stages);
          return empKpis.filter(k => reviewable.includes(k.status || ''));
        }
        return empKpis.filter(k => k.status === 'self_review');
      }
      if (viewLevel === 'skip_level') {
        const reviewable = resolveReviewableStatuses('skip_level', stages);
        return empKpis.filter(k => reviewable.includes(k.status || ''));
      }
      if (viewLevel === 'hr_pms') {
        const reviewable = resolveReviewableStatuses('hr_pms', stages);
        return empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'hr_pms_review');
      }
      if (viewLevel === 'audit') {
        const reviewable = resolveReviewableStatuses('auditor', stages);
        return empKpis.filter(k => reviewable.includes(k.status || '') && k.status !== 'audit');
      }
      if (viewLevel === 'management') return empKpis.filter(k => k.status === 'management_review');
      return [];
    };

    const rows: Record<string, string | number | null>[] = [];

    displayMembers.forEach(member => {
      const pending = getPendingKpis(member.id, member.relationship);
      if (pending.length === 0) return;

      const managerProfile = member.reporting_manager_id ? profileMap.get(member.reporting_manager_id) : null;
      const skipManagerProfile = managerProfile?.reporting_manager_id ? profileMap.get(managerProfile.reporting_manager_id) : null;
      const deptName = member.department_id ? (deptMap.get(member.department_id) || '') : (member.departments?.name || '');

      pending.forEach(kpi => {
        rows.push({
          'Employee Code': member.employee_code || '',
          'Employee Name': member.full_name || '',
          'Designation': member.designation || '',
          'PMS Grade': member.pms_grade || '',
          'Department': deptName,
          'Category': (kpi as any).kra_categories?.name || '',
          'KRA Name': kpi.kra_name || '',
          'KPI Name': kpi.kpi_name || '',
          'Review Period': kpi.review_period || '',
          'Review Year': kpi.review_year || null,
          'Status': kpi.status || '',
          'Reporting Manager': managerProfile?.full_name || '',
          'Skip Manager': skipManagerProfile?.full_name || '',
        });
      });
    });

    if (rows.length === 0) return;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 20 },
      { wch: 18 }, { wch: 22 }, { wch: 30 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 24 }, { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Pending KPIs');
    XLSX.writeFile(wb, `Pending_KPIs_${headerConfig.title.replace(/\s+/g, '_')}_${selectedPeriod}_${selectedYear}.xlsx`);
  };

  const headerConfig = HEADER_CONFIG[viewLevel];
  const HeaderIcon = headerConfig.icon;
  const statusOptions = STATUS_OPTIONS_BY_LEVEL[viewLevel];

  // Render stats cards based on view level
  const toggleStatusFilter = (filter: string) => {
    setStatusFilter(statusFilter === filter ? 'all' : filter);
  };

  const renderStatsCards = () => {
    if (viewLevel === 'team') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label={isFullAccess ? 'Total Employees' : 'Team Size'} value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Direct Pending" value={stats.stat1} color="yellow" subtitle="Awaiting manager review" onClick={() => toggleStatusFilter('pending_direct')} active={statusFilter === 'pending_direct'} />
          <StatCard icon={UserCheck} label="Skip-Level Pending" value={stats.stat2} color="amber" subtitle="Awaiting skip-level review" onClick={() => toggleStatusFilter('pending_skip')} active={statusFilter === 'pending_skip'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat3} color="green" subtitle="KPIs completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" className="col-span-2 md:col-span-1" />
        </div>
      );
    } else if (viewLevel === 'skip_level') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="amber" subtitle="Awaiting skip-level check" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={CheckCircle2} label="Reviewed" value={stats.stat2} color="green" subtitle="Skip-level completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    } else if (viewLevel === 'hr_pms') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} tooltip="Employees with at least one KPI in this period whose workflow includes the HR PMS stage." />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="amber" subtitle="Before HR PMS stage" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} tooltip="KPIs at the stage immediately before HR PMS, awaiting your queue." />
          <StatCard icon={FileCheck} label="In HR PMS Review" value={stats.stat2} color="purple" subtitle="Currently in HR PMS" onClick={() => toggleStatusFilter('in_review')} active={statusFilter === 'in_review'} tooltip="KPIs currently sitting in the HR PMS review stage." />
          <StatCard icon={CheckCircle2} label="HR PMS Reviewed" value={stats.stat3} color="green" subtitle="HR PMS completed" onClick={() => toggleStatusFilter('reviewed')} active={statusFilter === 'reviewed'} tooltip="KPIs with an HR PMS score recorded for this period (regardless of current stage)." />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" tooltip="All KPIs in this period for employees visible in this view (after filters)." />
        </div>
      );
    } else if (viewLevel === 'pending_self_review' || viewLevel === 'pending_manager_review' || viewLevel === 'pending_skip_review') {
      const labelMap = { pending_self_review: 'Pending Self Review', pending_manager_review: 'Pending Manager Review', pending_skip_review: 'Pending Skip Mgr Review' };
      const pendingSubtitle = (stats.stat2 > 0 || stats.stat3 > 0)
        ? [stats.stat2 > 0 ? `${stats.stat2} org KPI` : '', stats.stat3 > 0 ? `${stats.stat3} bi-monthly/quarterly` : ''].filter(Boolean).join(' · ')
        : 'KPIs at this stage';
      return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
          <StatCard icon={Clock} label={labelMap[viewLevel]} value={stats.stat1} color="amber" subtitle={pendingSubtitle} onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" />
        </div>
      );
    } else if (viewLevel === 'audit') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} tooltip="Employees with at least one KPI in this period whose workflow includes the Audit stage." />
          <StatCard icon={Clock} label="Pending Audit" value={stats.stat1} color="amber" subtitle="In pipeline for audit" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} tooltip="KPIs at the stage immediately before Audit, awaiting your queue." />
          <StatCard icon={FileCheck} label="In Audit" value={stats.stat2} color="purple" subtitle="Currently reviewing" onClick={() => toggleStatusFilter('in_audit')} active={statusFilter === 'in_audit'} tooltip="KPIs currently sitting in the Audit stage." />
          <StatCard icon={CheckCircle2} label="Forwarded" value={stats.stat3} color="green" subtitle="Sent for management" onClick={() => toggleStatusFilter('forwarded')} active={statusFilter === 'forwarded'} tooltip="KPIs that have moved past Audit (Management Review or Approved)." />
          <StatCard icon={Target} label="My KPIs" value={myKpiLevelData?.totalAssignedKpis || 0} color="blue" subtitle="KPIs assigned to you" onClick={() => toggleStatusFilter('my_assigned')} active={statusFilter === 'my_assigned'} tooltip="KPIs explicitly assigned to you for audit." />
        </div>
      );
    } else {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard icon={Users} label="Total Employees" value={stats.totalEmployees} color="primary" onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} tooltip="Employees with at least one KPI in this period whose workflow includes Management Review." />
          <StatCard icon={Clock} label="Pending Review" value={stats.stat1} color="emerald" subtitle="KPIs awaiting approval" onClick={() => toggleStatusFilter('pending')} active={statusFilter === 'pending'} tooltip="KPIs currently in Management Review awaiting approval." />
          <StatCard icon={CheckCircle2} label="Approved" value={stats.stat2} color="green" subtitle="KPIs completed" onClick={() => toggleStatusFilter('approved')} active={statusFilter === 'approved'} tooltip="KPIs with a management score recorded (or approved) this period." />
          <StatCard icon={Target} label="Total KPIs" value={stats.totalKpis} color="blue" subtitle="This period" tooltip="All KPIs in this period for employees visible in this view (after filters)." />
        </div>
      );
    }
  };

  // Compute progress bar segments from kpiStats based on view level
  const getProgressSegments = (kpiStats: { badge1: number; badge2: number; badge3: number; total: number; clearedKraSet: number; scoreReviewed?: number }) => {
    // For reviewer-stage views (hr_pms / audit / management), "done" = KPIs that
    // carry this stage's score signature (matches the top stat-card semantics).
    // This way the per-employee bar agrees with "HR PMS Reviewed / Auditor Reviewed
    // / Management Reviewed" totals and stays consistent regardless of whether a
    // KPI is currently sitting AT the stage or has already moved past it.
    if (viewLevel === 'hr_pms' || viewLevel === 'audit') {
      const done = kpiStats.scoreReviewed ?? kpiStats.badge3;
      // In-progress = KPIs at the stage but not yet scored (avoid double-counting).
      const inProgress = Math.max(0, kpiStats.badge2 - Math.max(0, done - kpiStats.badge3));
      return { done, inProgress, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
    }
    if (viewLevel === 'management') {
      const done = kpiStats.scoreReviewed ?? kpiStats.badge2;
      return { done, inProgress: kpiStats.badge3, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
    }
    // 2-tier (team / skip_level): badge2=done, badge1=pending
    return { done: kpiStats.badge2, inProgress: 0, total: kpiStats.total, clearedKraSet: kpiStats.clearedKraSet };
  };

  // Render badge based on view level
  const renderEmployeeBadges = (member: EmployeeProfile) => {
    const kpiStats = getEmployeeKpiStats(member.id, member.relationship);
    
    if (kpiStats.total === 0) {
      return (
        <div className="mt-2">
          <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-xs">
            No KPIs
          </Badge>
        </div>
      );
    }

    const segments = getProgressSegments(kpiStats);

    const renderBadges = () => {
      if (viewLevel === 'team') {
        return (
          <>
            {member.relationship === 'indirect' && (
              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800">
                Indirect
              </Badge>
            )}
            {member.relationship === 'direct' && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                Direct
              </Badge>
            )}
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} reviewed
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'skip_level') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} reviewed
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'hr_pms') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-xs dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {kpiStats.badge2} in review
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge3} reviewed
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
          </>
        );
      } else if (viewLevel === 'audit') {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {kpiStats.badge2} in audit
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge3} forwarded
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
            {(() => {
              const kpiCount = myKpiLevelData?.assignedKpisByEmployee?.get(member.id)?.length;
              return kpiCount ? (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300 text-xs dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-600">
                  {kpiCount} KPIs assigned to you
                </Badge>
              ) : null;
            })()}
          </>
        );
      } else if (viewLevel === 'pending_self_review' || viewLevel === 'pending_manager_review' || viewLevel === 'pending_skip_review') {
        const stageLabel = viewLevel === 'pending_self_review' ? 'pending self' : viewLevel === 'pending_manager_review' ? 'pending mgr' : 'pending skip';
        return (
          <>
            {(kpiStats.badge1 > 0 || (kpiStats as any).orgKpiCount > 0 || (kpiStats as any).nonMonthlyCount > 0) && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                {kpiStats.badge1} {stageLabel}
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
          </>
        );
      } else {
        return (
          <>
            {kpiStats.badge1 > 0 && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                {kpiStats.badge1} pending
              </Badge>
            )}
            {kpiStats.badge3 > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {kpiStats.badge3} in pipeline
              </Badge>
            )}
            {kpiStats.badge2 > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                {kpiStats.badge2} approved
              </Badge>
            )}
            {(kpiStats as any).orgKpiCount > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                {(kpiStats as any).orgKpiCount} org KPI
              </Badge>
            )}
            {(kpiStats as any).nonMonthlyCount > 0 && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
              </Badge>
            )}
          </>
        );
      }
    };

    return (
      <div className="space-y-2 mt-2 w-full">
        <EmployeeProgressBar
          done={segments.done}
          inProgress={segments.inProgress}
          total={segments.total}
          clearedKraSet={segments.clearedKraSet}
          labelMode={
            viewLevel === 'hr_pms' || viewLevel === 'audit' || viewLevel === 'management'
              ? 'done'
              : 'cleared'
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          {renderBadges()}
        </div>
      </div>
    );
  };

  const renderEmployeeCard = (member: EmployeeProfile) => {
    const managerName = getManagerName(member.reporting_manager_id);
    const isAssigned = viewLevel === 'audit' && (
      (myAssignedEmployeeIds instanceof Set && myAssignedEmployeeIds.has(member.id)) ||
      (myKpiLevelData?.allAssignedEmployeeIds?.has(member.id))
    );
    return (
      <Card
        key={member.id}
        className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 group ${isAssigned ? 'ring-1 ring-primary/30 border-primary/20' : ''}`}
        onClick={() => handleEmployeeClick(member)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={member.avatar_url || undefined} />
              <AvatarFallback>{getInitials(member.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                {isFullAccess ? (
                  <EmployeeContactCard
                    employee={member}
                    departmentName={(member as any).departments?.name ?? undefined}
                    onViewKpis={() => handleEmployeeClick(member)}
                  >
                    <span
                      className="font-medium truncate group-hover:text-primary transition-colors cursor-pointer hover:underline"
                      title="Click to view contact info"
                    >
                      {formatEmployeeName(member.full_name, member.email, member.employee_code)}
                    </span>
                  </EmployeeContactCard>
                ) : (
                  <p className="font-medium truncate group-hover:text-primary transition-colors">
                    {formatEmployeeName(member.full_name, member.email, member.employee_code)}
                  </p>
                )}
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <EmployeeScoreBadge score={employeeScoreMap.get(member.id) ?? undefined} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {member.designation || member.email}
              </p>
              {isFullAccess && managerName && (
                <p className="text-xs text-muted-foreground truncate mt-1">
                  Manager: {managerName}
                </p>
              )}
              {renderEmployeeBadges(member)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Soften loading: only show full skeleton on true cold start (no previous data).
  // v2.64.3 — Cross-source flicker fix: `keepPreviousData` only retains data within
  // the same query key. When switching panels (e.g. Team → HR PMS) the data source
  // changes (allProfiles → stageFilteredProfiles), so baseMembers becomes undefined
  // for one render → skeleton flashes. Cache the last non-empty baseMembers in a
  // ref and use it as the render fallback during cross-source switches. Reset on
  // viewLevel change ONLY after the new query has resolved with an empty result.
  const lastGoodMembersRef = useRef<EmployeeProfile[]>([]);
  const lastViewLevelRef = useRef<typeof viewLevel>(viewLevel);
  useEffect(() => {
    if (baseMembers && baseMembers.length > 0) {
      lastGoodMembersRef.current = baseMembers;
      lastViewLevelRef.current = viewLevel;
    } else if (!isLoading && baseMembers && baseMembers.length === 0 && lastViewLevelRef.current !== viewLevel) {
      // New panel resolved to a legitimate empty state — clear stale fallback
      lastGoodMembersRef.current = [];
      lastViewLevelRef.current = viewLevel;
    }
  }, [baseMembers, isLoading, viewLevel]);

  const hasAnyData = (baseMembers?.length ?? 0) > 0 || lastGoodMembersRef.current.length > 0;
  const isBackgroundFetching = isLoading && hasAnyData;

  if (isLoading && !hasAnyData) {
    return (
      <div className="space-y-6 min-h-[600px]">
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-[600px] relative">
      {isBackgroundFetching && (
        <div
          className="absolute top-0 right-0 z-10 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border"
          role="status"
          aria-label="Loading view"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Updating…</span>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-gradient-to-br ${headerConfig.gradient} flex items-center justify-center`}>
            <HeaderIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{headerConfig.title}</h1>
            <p className="text-sm text-muted-foreground">{headerConfig.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="gap-1.5"
                  aria-label="Refresh data"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Reload employees, KPI rows, and review scores from the server.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={handleExportPendingKpis} className="gap-1.5">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export Pending</span>
          </Button>
          {viewLevel === 'audit' && (
            <Button variant="outline" size="sm" onClick={() => setAssignmentDialogOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1.5" />
              Manage Assignments
            </Button>
          )}
          {isExplorerCapable && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isExploreMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(isExploreMode ? 'all' : 'cross_check')}
                    className={isExploreMode
                      ? 'gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
                      : 'gap-1.5'}
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">Explore All</span>
                    {isExploreMode && <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0 text-[10px] px-1.5">ON</Badge>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Browse all employees in the organization in read-only mode. Useful for cross-checking ratings outside your assigned audit scope.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Compact Period Selector */}
          <div className="p-2 sm:p-3 rounded-lg bg-muted/30 border border-border/50">
            <ReviewPeriodSelectorEnhanced
              value={periodSelection}
              onChange={onPeriodSelectionChange}
            />
          </div>
        </div>
      </div>

      {/* v2.65.0 — Explorer Mode banner */}
      {isExploreMode && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">Explorer Mode (Read-Only)</p>
            <p className="text-amber-800 dark:text-amber-300/90 text-xs mt-0.5">
              Viewing all employees in the organization — including those outside your assigned scope. Scoring, queries, and workflow actions are disabled. Toggle off to return to your normal review queue.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {!isExploreMode && renderStatsCards()}

      {/* v2.64.9 — Roster resolution diagnostic (admin / full-access only) */}
      {isFullAccess && requiredStage && rosterMeta && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 -mt-2">
          <Info className="h-3 w-3" />
          <span>
            {(stageFilteredProfiles?.length ?? 0).toLocaleString()} eligible
            {' '}of {rosterMeta.totalEligiblePool.toLocaleString()} active employees
            {rosterMeta.seededFromKpis > 0 && ` · ${rosterMeta.seededFromKpis} seeded from KPI presence`}
            {rosterMeta.fallbackUsed && ' · using fallback resolution'}
          </span>
        </div>
      )}

      {/* Auditor Workload Summary (audit view only) */}
      {viewLevel === 'audit' && (auditorWorkloadStats.length > 0 || unassignedStats) && (
        <div className="space-y-2">
          <button
            onClick={() => setAuditorWorkloadExpanded(prev => !prev)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Users className="h-4 w-4" />
            Auditor Workload ({auditorWorkloadStats.length}{unassignedStats ? ' + unassigned' : ''})
            {auditorWorkloadExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {auditorWorkloadExpanded && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setAuditorFilter(null)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition-all ${
                  !auditorFilter
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'border-border bg-card text-foreground hover:border-primary/50'
                }`}
              >
                <div className="font-medium">All Auditors</div>
              </button>
              {auditorWorkloadStats.map(a => (
                <button
                  key={a.auditorId}
                  onClick={() => setAuditorFilter(auditorFilter === a.auditorId ? null : a.auditorId)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-[140px] ${
                    auditorFilter === a.auditorId
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium text-xs text-foreground truncate">
                    {a.employeeCode ? `${a.employeeCode} - ` : ''}{a.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {a.employeeCount} emp
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {a.pending > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                        {a.pending} pending
                      </span>
                    )}
                    {a.inAudit > 0 && (
                      <span className="inline-flex items-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 text-[10px] font-medium">
                        {a.inAudit} audit
                      </span>
                    )}
                    {a.forwarded > 0 && (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 text-[10px] font-medium">
                        {a.forwarded} done
                      </span>
                    )}
                    {a.total === 0 && (
                      <span className="text-[10px] text-muted-foreground">No KPIs</span>
                    )}
                  </div>
                </button>
              ))}
              {unassignedStats && (
                <button
                  onClick={() => setAuditorFilter(auditorFilter === '__unassigned__' ? null : '__unassigned__')}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all min-w-[140px] ${
                    auditorFilter === '__unassigned__'
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                      : 'border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/20'
                  }`}
                >
                  <div className="font-medium text-xs text-amber-700 dark:text-amber-400 truncate flex items-center gap-1">
                    ⚠ Unassigned
                  </div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                    {unassignedStats.employeeCount} emp
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {unassignedStats.pending > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                        {unassignedStats.pending} pending
                      </span>
                    )}
                    {unassignedStats.inAudit > 0 && (
                      <span className="inline-flex items-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 text-[10px] font-medium">
                        {unassignedStats.inAudit} audit
                      </span>
                    )}
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      )}


      <EmployeeFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDepartment={selectedDepartment}
        onDepartmentChange={setSelectedDepartment}
        departments={departments}
        selectedDesignation={selectedDesignation}
        onDesignationChange={setSelectedDesignation}
        designations={designations}
        selectedGrade={selectedGrade}
        onGradeChange={setSelectedGrade}
        grades={grades}
        selectedManager={selectedManager}
        onManagerChange={setSelectedManager}
        managers={managers}
        showManagerFilter={isFullAccess}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusOptions={isExploreMode ? [] : statusOptions}
        onMoreFiltersOpen={() => setGradesEnabled(true)}
      />

      {/* Employees Grid */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">
            {isFullAccess ? 'All Employees' : 'Team Members'}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Select an employee to view their scorecard and review KPIs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayMembers && displayMembers.length > 0 ? (
            <>
              {/* Discoverability pill: explains urgency sort + offers quick-jump to completed */}
              {statusFilter === 'all' && totalPages > 1 && reviewedOnBackPagesCount > 0 && completedFilterForView && (
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs sm:text-sm">
                  <div className="flex items-start sm:items-center gap-2 flex-1 text-muted-foreground">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" />
                    <span>
                      Page <span className="font-medium text-foreground">{safePage}</span> of{' '}
                      <span className="font-medium text-foreground">{totalPages}</span> — sorted by most pending first.{' '}
                      <span className="font-medium text-foreground">{reviewedOnBackPagesCount.toLocaleString()}</span>{' '}
                      fully reviewed {reviewedOnBackPagesCount === 1 ? 'employee appears' : 'employees appear'} on later pages.
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => setStatusFilter(completedFilterForView)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Show only Reviewed
                  </Button>
                </div>
              )}

              {/* Audit grouped view: Assigned to Me + All Others */}
              {isAuditGrouped ? (
                <div className="space-y-6">
                  {/* Assigned Section */}
                  {pagedAssignedMembers.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="default" className="text-xs">
                        My Assignments ({assignedMembers.length})
                      </Badge>
                    </div>
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {pagedAssignedMembers.map(member => renderEmployeeCard(member))}
                    </div>
                  </div>
                  )}
                  {/* Separator */}
                  {pagedOtherMembers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="text-xs">
                          All Others ({otherMembers.length})
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                        {pagedOtherMembers.map(member => renderEmployeeCard(member))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {pagedDisplayMembers.map(member => renderEmployeeCard(member))}
                </div>
              )}

              {/* Pagination footer — only render when there is more than one page */}
              {totalMembers > pageSize && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                  <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                    <span className="font-medium text-foreground">Page {safePage} of {totalPages}</span>
                    <span className="mx-2">·</span>
                    Showing <span className="font-medium text-foreground">{sliceStart + 1}</span>–
                    <span className="font-medium text-foreground">{Math.min(sliceEnd, totalMembers)}</span> of{' '}
                    <span className="font-medium text-foreground">{totalMembers.toLocaleString()}</span> employees
                  </div>
                  <div className="flex items-center gap-3 flex-wrap justify-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:inline">Per page</span>
                      <Select value={String(pageSize)} onValueChange={(v) => setPageSizeStr(v)}>
                        <SelectTrigger className="h-8 w-[72px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map(s => (
                            <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Pagination className="mx-0 w-auto">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (safePage > 1) setPage(String(safePage - 1)); }}
                            className={safePage <= 1 ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                        {(() => {
                          const pages: (number | 'ellipsis')[] = [];
                          const add = (n: number) => pages.push(n);
                          const window = 1;
                          const start = Math.max(2, safePage - window);
                          const end = Math.min(totalPages - 1, safePage + window);
                          add(1);
                          if (start > 2) pages.push('ellipsis');
                          for (let i = start; i <= end; i++) add(i);
                          if (end < totalPages - 1) pages.push('ellipsis');
                          if (totalPages > 1) add(totalPages);
                          return pages.map((p, idx) =>
                            p === 'ellipsis' ? (
                              <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                            ) : (
                              <PaginationItem key={p}>
                                <PaginationLink
                                  href="#"
                                  isActive={p === safePage}
                                  onClick={(e) => { e.preventDefault(); setPage(String(p)); }}
                                >
                                  {p}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          );
                        })()}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (safePage < totalPages) setPage(String(safePage + 1)); }}
                            className={safePage >= totalPages ? 'pointer-events-none opacity-50' : ''}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </div>
              )}
            </>
          ) : (() => {
            // BUG-101784 — Distinguish "data failed to load" from "no results".
            // When org-wide PostgREST queries time out (statement timeout) the
            // grid previously rendered "No employees found" with no recourse.
            // Now we surface an explicit error block with retry so admins
            // (incl. Vivek 101784 case) can recover without a full page reload.
            const dataError =
              profilesError || teamError || skipError || stageFilteredError || periodKpisError || submissionScoresError;
            if (dataError) {
              return (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive/70" />
                  <p className="font-medium text-foreground">Couldn't load this dashboard</p>
                  <p className="text-sm mt-1 max-w-md mx-auto">
                    The roster query did not respond in time. This usually clears
                    after a refresh. If it keeps failing, narrow the period or
                    contact your administrator.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refetchProfiles();
                        refetchTeam();
                        refetchSkip();
                        refetchStageFiltered();
                        refetchPeriodKpis();
                        refetchSubmissionScores();
                        handleRefresh();
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-1.5" /> Retry
                    </Button>
                  </div>
                </div>
              );
            }
            const hasActiveFilters =
              !!searchQuery || !!selectedDepartment || !!selectedDesignation ||
              !!selectedGrade || !!selectedManager || statusFilter !== 'all';
            return (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">
                  {hasActiveFilters
                    ? 'No employees match the current filters'
                    : isFullAccess ? 'No employees found' : 'No team members found'}
                </p>
                <p className="text-sm mt-1">
                  {hasActiveFilters
                    ? 'Try clearing filters or changing the period.'
                    : isFullAccess
                      ? 'No employees in the system yet'
                      : "You don't have any direct reports assigned"}
                </p>
                {hasActiveFilters && (
                  <div className="mt-4">
                    <Button variant="outline" size="sm" onClick={clearAllFilters}>
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Audit Assignment Dialog */}
      {viewLevel === 'audit' && (
        <AuditAssignmentDialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen} />
      )}
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'primary' | 'purple' | 'yellow' | 'green' | 'blue' | 'amber' | 'emerald' | 'orange';
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  tooltip?: string;
}

const colorMap: Record<StatCardProps['color'], { border: string; bg: string; text: string }> = {
  primary: { border: 'border-l-primary', bg: 'bg-primary/10', text: 'text-primary' },
  purple: { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-600' },
  yellow: { border: 'border-l-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-600' },
  green: { border: 'border-l-green-500', bg: 'bg-green-500/10', text: 'text-green-600' },
  blue: { border: 'border-l-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-600' },
  amber: { border: 'border-l-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-600' },
  emerald: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
  orange: { border: 'border-l-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-600' },
};

// v2.64.8: forwardRef so Radix Tooltip and other ref-forwarding wrappers can
// attach refs without React warnings.
const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { icon: Icon, label, value, color, subtitle, className = '', onClick, active, tooltip },
  ref,
) {
  const colors = colorMap[color];
  const isClickable = !!onClick;

  const card = (
    <Card
      ref={ref}
      className={`border-l-4 ${colors.border} ${className} ${isClickable ? 'cursor-pointer transition-all hover:shadow-md' : ''} ${active ? 'ring-2 ring-primary shadow-md' : ''}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 sm:pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1">
              {label}
              {tooltip && <Info className="h-3 w-3 opacity-60" />}
            </p>
            <p className={`text-xl sm:text-3xl font-bold ${color === 'primary' ? '' : colors.text}`}>{value}</p>
            {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">{subtitle}</p>}
          </div>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-full ${colors.bg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${colors.text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltip) return card;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// Mini progress bar for employee cards
function EmployeeProgressBar({ done, inProgress, total, clearedKraSet, labelMode = 'cleared' }: { done: number; inProgress: number; total: number; clearedKraSet: number; labelMode?: 'cleared' | 'done' }) {
  if (total === 0) return null;
  const donePct = (done / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  const labelLeft = labelMode === 'done' ? done : clearedKraSet;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden flex flex-row">
        {donePct > 0 && (
          <div className="h-full bg-green-500 dark:bg-green-400" style={{ width: `${donePct}%` }} />
        )}
        {inProgressPct > 0 && (
          <div className="h-full bg-amber-400 dark:bg-amber-500" style={{ width: `${inProgressPct}%` }} />
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
        {labelLeft}/{total}
      </span>
    </div>
  );
}

// Compact score badge for employee cards
function EmployeeScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center justify-center h-7 min-w-[2rem] px-1.5 rounded-md bg-muted text-muted-foreground text-xs font-semibold">
        —
      </span>
    );
  }

  const rounded = Math.round(score);
  const clamped = Math.min(5, Math.max(0, rounded));
  const badgeClass = getScoreBadgeClass(clamped);

  return (
    <span
      className={`inline-flex items-center justify-center h-7 min-w-[2rem] px-1.5 rounded-md text-xs font-bold ${badgeClass}`}
      title={`Overall Score: ${score}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

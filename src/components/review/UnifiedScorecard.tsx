import React, { useState, useMemo, useEffect } from 'react';
import { formatDate } from '@/lib/dateUtils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useKpisByEmployee, useReviewSubmissions, useApproveKpi, useRaiseQuery, useKpiQueries, useSendBackKpi, useEmployeeKpiPeriods, RatingLevel, KPI, KpiQuery } from '@/hooks/useKpis';
import { useSubPeriodSubmissions, useSubPeriodSubmissionsByKpis, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useObservationsByKpis } from '@/hooks/useKpiObservations';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useOrgKpiDataOwnerNames, getOwnerNamesForKpi } from '@/hooks/useOrgKpiDataOwner';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { ManagerDailyOverrideEditor, calculateOverriddenScore } from '@/components/review/ManagerDailyOverrideEditor';
import { ReviewLevelOverrideEditor, calculateOverriddenScore as calculateReviewerOverriddenScore } from '@/components/review/ReviewLevelOverrideEditor';
import { useManagerSubPeriodOverride } from '@/hooks/useManagerSubPeriodOverride';
import { useReviewerSubPeriodOverride } from '@/hooks/useReviewerSubPeriodOverride';
import { QualitativeOption } from '@/lib/qualitativeUom';
import { useAuth } from '@/contexts/AuthContext';
import { useKpiSorting } from '@/hooks/useKpiSorting';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart, type CategorySortBy } from '@/components/dashboard/CategoryScoreChart';
import { PreviousMonthsScoreMini } from '@/components/review/PreviousMonthsScoreMini';
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { KpiSortControl } from '@/components/ui/KpiSortControl';
import { QueryHistoryDialog } from '@/components/review/QueryHistoryDialog';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
import { SendBackOrgKpiDialog } from '@/components/review/SendBackOrgKpiDialog';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { calculateRating } from '@/lib/ratingCalculation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Lock, MessageSquare, Undo2, Check, Eye, ChevronDown, ChevronUp, History, Edit2, Send, Shield, Briefcase, User, CalendarDays, UserCheck, ClipboardCheck, AlertTriangle, X
} from 'lucide-react';
import { SelfReviewSheet } from '@/components/review/SelfReviewSheet';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { useKraCategories } from '@/hooks/useOrganization';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  kpiStatusColors, 
  kpiStatusLabels,
  statusColors,
  statusLabels,
  ratingOptions,
  getScoreBadgeClass,
  getScoreLabel,
} from '@/lib/reviewConstants';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { NaConfirmationCard } from '@/components/review/NaConfirmationCard';
import { OrgKpiRatingOverrideWarning } from '@/components/review/OrgKpiRatingOverrideWarning';
import { RollbackRequestBanner } from '@/components/review/RollbackRequestBanner';
import { SentBackBanner } from '@/components/review/SentBackBanner';
import { RollbackRequestDialog } from '@/components/review/RollbackRequestDialog';
import { usePendingRollbackRequest } from '@/hooks/useKpiRollbackRequests';
import { useAuditKpiAssignments } from '@/hooks/useAuditKpiAssignments';
import { KraExportMenu } from '@/components/review/KraExportMenu';
import { EmployeeBulkZeroScoreDialog } from '@/components/review/EmployeeBulkZeroScoreDialog';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { useRemarksMandatorySettings } from '@/hooks/useWorkflowSettings';
import { 
  resolveForwardStatus, 
  resolvePendingStatuses, 
  resolveReviewableStatuses, 
  resolveSendBackTargets, 
  resolveSendBackStatus,
  resolveActiveReviewStage,
  DEFAULT_WORKFLOW_STAGES 
} from '@/lib/workflowEngine';

// View level type - determines behavior and data access
export type ScorecardViewLevel = 'self' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms';

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
  departments?: { id: string; name: string; code: string | null } | null;
}

// Import PeriodSelection type
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';

interface UnifiedScorecardProps {
  viewLevel: ScorecardViewLevel;
  employee: EmployeeProfile;
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
  onBack?: () => void;
  autoOpenKpiId?: string | null;
}

// Static configuration per view level (non-workflow-dependent parts)
const VIEW_LEVEL_STATIC: Record<ScorecardViewLevel, {
  title: string;
  description: string;
  scoreFieldPrefix: string;
  previousScoreField: 'self_score' | 'manager_score' | 'auditor_score' | 'skip_level_score' | 'hr_pms_score';
  actionLabel: string;
  roleIcon: React.ElementType;
}> = {
  self: {
    title: 'My KPIs',
    description: 'Submit your self-assessment',
    scoreFieldPrefix: 'self',
    previousScoreField: 'self_score',
    actionLabel: 'Submit',
    roleIcon: User,
  },
  manager: {
    title: 'Manager Review',
    description: 'Review and provide your assessment for this KPI',
    scoreFieldPrefix: 'manager',
    previousScoreField: 'self_score',
    actionLabel: 'Approve',
    roleIcon: User,
  },
  skip_level: {
    title: 'Skip-Level Review',
    description: 'Review as skip-level reporting manager',
    scoreFieldPrefix: 'skip_level',
    previousScoreField: 'manager_score',
    actionLabel: 'Forward',
    roleIcon: UserCheck,
  },
  hr_pms: {
    title: 'HR PMS Review',
    description: 'HR PMS team review and assessment',
    scoreFieldPrefix: 'hr_pms',
    previousScoreField: 'skip_level_score' as const,
    actionLabel: 'Forward',
    roleIcon: ClipboardCheck,
  },
  auditor: {
    title: 'Audit Review',
    description: 'Verify and audit this KPI performance',
    scoreFieldPrefix: 'auditor',
    previousScoreField: 'manager_score',
    actionLabel: 'Forward to Management',
    roleIcon: Shield,
  },
  management: {
    title: 'Management Review',
    description: 'Final review and approval of this KPI',
    scoreFieldPrefix: 'management',
    previousScoreField: 'auditor_score',
    actionLabel: 'Final Approve',
    roleIcon: Briefcase,
  },
};

export function UnifiedScorecard({ 
  viewLevel,
  employee, 
  periodSelection,
  onPeriodSelectionChange,
  onBack,
  autoOpenKpiId 
}: UnifiedScorecardProps) {
  // Derived values from period selection
  const selectedPeriod = periodSelection.selectedMonth;
  const selectedYear = periodSelection.selectedYear;
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useKpisByEmployee(employee.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const remarksMandatory = useRemarksMandatorySettings();
  
  const staticConfig = VIEW_LEVEL_STATIC[viewLevel];
  const isSelfMode = viewLevel === 'self';
  
  // Self-mode specific hooks & state
  const { data: kraCategories } = useKraCategories();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedKpiForSelfReview, setSelectedKpiForSelfReview] = useState<KPI | null>(null);
  const [selfAutoOpenQueryHistory, setSelfAutoOpenQueryHistory] = useState(false);
  const [dismissedPendingPeriods, setDismissedPendingPeriods] = useState<string[]>([]);
  
  // Fetch the employee's workflow stages dynamically
  const { data: workflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;

  // Build dynamic config from workflow stages
  const config = useMemo(() => {
    // Self mode doesn't need reviewer workflow config
    if (viewLevel === 'self') {
      return {
        ...staticConfig,
        pendingStatus: 'self_review',
        activeReviewStage: 'self_review',
        reviewableStatuses: ['kra_set', 'self_review'],
        forwardStatus: 'self_review',
        sendBackTargets: [] as { value: string; label: string }[],
      };
    }
    
    // For hr_pms: the "previous score" field depends on which stage precedes hr_pms_review.
    // If skip_level_check exists in the workflow, it comes before hr_pms_review → use skip_level_score.
    // Otherwise (manager_check → hr_pms_review directly) → use manager_score.
    let resolvedPreviousScoreField = staticConfig.previousScoreField;
    if (viewLevel === 'hr_pms') {
      resolvedPreviousScoreField = effectiveStages.includes('skip_level_check')
        ? 'skip_level_score'
        : 'manager_score';
    }

    // For hr_pms: resolve dynamic action label based on what comes AFTER hr_pms_review.
    let resolvedActionLabel = staticConfig.actionLabel;
    if (viewLevel === 'hr_pms') {
      const nextAfterHrPms = (() => {
        const idx = effectiveStages.indexOf('hr_pms_review');
        if (idx === -1 || idx >= effectiveStages.length - 1) return null;
        return effectiveStages[idx + 1];
      })();
      resolvedActionLabel =
        nextAfterHrPms === 'approved'
          ? 'Approve'
          : nextAfterHrPms === 'audit'
            ? 'Forward to Audit'
            : 'Forward';
    }

    const activeStage = resolveActiveReviewStage(viewLevel, effectiveStages);

    return {
      ...staticConfig,
      previousScoreField: resolvedPreviousScoreField,
      actionLabel: resolvedActionLabel,
      pendingStatus: resolvePendingStatuses(viewLevel, effectiveStages)[0] || 'self_review',
      activeReviewStage: activeStage,
      reviewableStatuses: resolveReviewableStatuses(viewLevel, effectiveStages),
      forwardStatus: resolveForwardStatus(viewLevel, effectiveStages),
      sendBackTargets: resolveSendBackTargets(viewLevel, effectiveStages),
    };
  }, [viewLevel, effectiveStages, staticConfig]);
  
  // Filter KPIs by period and year, excluding non-issued (draft/template) KPIs (v1.45.94)
  const kpis = useMemo(() => allKpis?.filter(k => {
    const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
    const yearMatch = k.review_year === selectedYear;
    return periodMatch && yearMatch;
  }), [allKpis, selectedPeriod, selectedYear]);

  // Fetch KPI-level audit assignments (period-filtered to avoid URL length limits)
  const auditKpiIdList = useMemo(() => (kpis || []).map(k => k.id), [kpis]);
  const { data: auditKpiAssignments } = useAuditKpiAssignments(viewLevel === 'auditor' ? auditKpiIdList : []);

  // Sub-period submissions for self-mode SelfReviewSheet
  const selfModeKpiIds = useMemo(() => isSelfMode ? (kpis || []).map(k => k.id) : [], [isSelfMode, kpis]);
  const { data: subPeriodSubmissions, isLoading: subPeriodLoading } = useSubPeriodSubmissionsByKpis(
    selfModeKpiIds, selectedPeriod, selectedYear
  );

  // Fetch org KPI values for this period
  const { data: orgKpiValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);
  const { data: dataOwnerNamesMap } = useOrgKpiDataOwnerNames();

  // Create org KPI values lookup map (toLowerCase for consistent matching)
  const orgKpiValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null; entered_by_name: string | null }>();
    orgKpiValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name.toLowerCase()}||${v.kpi_name.toLowerCase()}||${deptPart}||${empPart}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source, entered_by_name: v.entered_by_name });
    });
    return map;
  }, [orgKpiValues]);

  // Helper to get org KPI value based on scope
  const getOrgKpiValue = (kpi: KPI) => {
    if (!kpi.is_org_level) return null;
    const scope = (kpi as any).org_level_scope || 'employee';
    let key: string;
    if (scope === 'organization') {
      key = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||null||null`;
    } else if (scope === 'department') {
      const deptId = employee.department_id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||${deptId}||null`;
    } else {
      const empId = employee.id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||null||${empId}`;
    }
    const result = orgKpiValuesMap.get(key);
    if (result) return result;
    // Fallback: check base org-level record (before propagation)
    if (scope !== 'organization') {
      const fallbackKey = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||null||null`;
      return orgKpiValuesMap.get(fallbackKey) || null;
    }
    return null;
  };

  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);
  const { data: observationsMap } = useObservationsByKpis(kpiIds);
  const observationCounts = useMemo(() => {
    const map = new Map<string, number>();
    observationsMap?.forEach((obs, kpiId) => map.set(kpiId, obs.length));
    return map;
  }, [observationsMap]);

  // Fetch ALL-period submissions for tracker modal & review panel history
  const allKpiIds = useMemo(() => allKpis?.map(k => k.id) || [], [allKpis]);
  const { data: allSubmissions } = useReviewSubmissions(allKpiIds);

  // UI State
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [queryDialogOpen, setQueryDialogOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [expandedDailyKpis, setExpandedDailyKpis] = useState<Set<string>>(new Set());
  const [categorySortBy, setCategorySortBy] = useState<CategorySortBy>('score-desc');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  // Review state
  const [reviewerScore, setReviewerScore] = useState<number | null>(null);
  const [reviewerRemarks, setReviewerRemarks] = useState('');
  const [reviewerEvidenceUrls, setReviewerEvidenceUrls] = useState<string[]>([]);
  const [reviewerAchievedValue, setReviewerAchievedValue] = useState<number | string | null>(null);
  const [queryReason, setQueryReason] = useState('');
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<string>(config.sendBackTargets[0]?.value || 'employee');
  
  // Daily override state
  const [reviewerAgrees, setReviewerAgrees] = useState<boolean | null>(null);
  const [dailyOverrides, setDailyOverrides] = useState<Map<string, number>>(new Map());
  const [overrideReason, setOverrideReason] = useState('');
  
  // N/A confirmation state
  const [naConfirmed, setNaConfirmed] = useState(false);
  const [naRemarks, setNaRemarks] = useState('');
  
  // Reviewer-initiated N/A state
  const [reviewerMarkNa, setReviewerMarkNa] = useState(false);
  const [markNaRemarks, setMarkNaRemarks] = useState('');
  
  // N/A override state (reviewer overrides existing N/A to make KPI applicable)
  const [naOverridden, setNaOverridden] = useState(false);
  const [overrideNaRemarks, setOverrideNaRemarks] = useState('');

  // Org KPI send-back dialog state (for management)
  const [orgKpiSendBackOpen, setOrgKpiSendBackOpen] = useState(false);
  const [selectedOrgKpiForSendBack, setSelectedOrgKpiForSendBack] = useState<KPI | null>(null);

  // Org KPI override warning state
  const [orgOverrideWarningOpen, setOrgOverrideWarningOpen] = useState(false);
  const [pendingApproveAction, setPendingApproveAction] = useState<boolean | null>(null);

  // Rollback state
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const { data: pendingRollback } = usePendingRollbackRequest(selectedKpi?.id);

  const approveKpi = useApproveKpi();
  const raiseQuery = useRaiseQuery();
  const sendBackKpi = useSendBackKpi();
  
  // Hooks for manager vs reviewer override
  const managerOverride = useManagerSubPeriodOverride();
  const reviewerOverride = useReviewerSubPeriodOverride();
  
  const isSavingOverrides = viewLevel === 'manager' 
    ? managerOverride.isLoading 
    : reviewerOverride.isLoading;

  const submissionMap = useMemo(() => new Map(submissions?.map(s => [s.kpi_id, s])), [submissions]);

  // Sorting with default Weightage (High to Low)
  const { sortedKpis: rawSortedKpis, sortConfig, setSort } = useKpiSorting(kpis, {}, submissionMap);
  const sortedKpis = useMemo(() => {
    let filtered = rawSortedKpis;
    if (statusFilter) filtered = filtered.filter(k => k.status === statusFilter);
    if (isSelfMode && activeCategory !== 'All') {
      const cat = kraCategories?.find((c: any) => c.name === activeCategory);
      if (cat) filtered = filtered.filter(k => k.category_id === cat.id);
    }
    return filtered;
  }, [rawSortedKpis, statusFilter, isSelfMode, activeCategory, kraCategories]);

  // Available categories for self-mode filter
  const availableSelfCategories = useMemo(() => {
    if (!isSelfMode || !kraCategories) return [];
    return kraCategories.filter((cat: any) => kpis?.some(k => k.category_id === cat.id));
  }, [isSelfMode, kraCategories, kpis]);

  // Last self-review submission date (regular KPIs only: exclude org & non-monthly)
  const lastSelfReviewDate = useMemo(() => {
    if (!kpis || !submissions) return null;
    const regularKpis = kpis.filter(k =>
      !k.is_org_level &&
      (!k.frequency || ['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())) &&
      k.status !== 'kra_set'
    );
    let maxDate: string | null = null;
    for (const k of regularKpis) {
      const sub = submissionMap.get(k.id);
      if (!sub || sub.kpi_status === 'sent_back') continue;
      const d = sub.submitted_at || sub.updated_at;
      if (d && (!maxDate || d > maxDate)) maxDate = d;
    }
    return maxDate;
  }, [kpis, submissions, submissionMap]);

  // Pending period alerts (self mode)
  const MONTH_ORDER_SELF = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const pendingPeriods = useMemo(() => {
    if (!isSelfMode || !allKpis) return [];
    const actionableStatuses = ['kra_set', 'self_review'];
    const currentMonthIdx = MONTH_ORDER_SELF.indexOf(selectedPeriod);
    const periodMap = new Map<string, number>();
    allKpis.forEach(k => {
      if (!actionableStatuses.includes(k.status || '')) return;
      if (!k.review_period || k.review_year == null) return;
      const monthIdx = MONTH_ORDER_SELF.indexOf(k.review_period);
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
      .sort((a, b) => a.year !== b.year ? b.year - a.year : MONTH_ORDER_SELF.indexOf(b.month) - MONTH_ORDER_SELF.indexOf(a.month));
  }, [isSelfMode, allKpis, selectedPeriod, selectedYear, dismissedPendingPeriods]);

  // Auto-open KPI from deep link (self mode)
  useEffect(() => {
    if (!isSelfMode || !autoOpenKpiId || !allKpis || isLoading) return;
    const targetKpi = kpis?.find(k => k.id === autoOpenKpiId);
    if (targetKpi) {
      setSelectedKpiForSelfReview(targetKpi);
      return;
    }
    const match = allKpis.find(k => k.id === autoOpenKpiId);
    if (match?.review_period && match.review_year != null) {
      onPeriodSelectionChange({
        ...periodSelection,
        mode: 'single' as const,
        selectedMonth: match.review_period,
        selectedYear: match.review_year,
        months: [match.review_period],
        periodRanges: [{ month: match.review_period, year: match.review_year }],
      });
    }
  }, [isSelfMode, autoOpenKpiId, kpis, allKpis, isLoading]);

  const queryMap = useMemo(() => {
    const map = new Map<string, KpiQuery[]>();
    queries?.forEach(q => {
      const existing = map.get(q.kpi_id) || [];
      map.set(q.kpi_id, [...existing, q]);
    });
    return map;
  }, [queries]);

  // Get the relevant score based on view level (cascade down the chain)
  const getRelevantScore = (submission: any, kpiStatus?: string): number | null => {
    if (!submission) return null;
    // Only use final_score when KPI is approved — prevents stale imported values from overriding actual reviewer scores
    if (kpiStatus === 'approved' && submission.final_score !== null && submission.final_score !== undefined) {
      return submission.final_score;
    }
    // Universal 8-stage fallback chain for ALL view levels (POLICY §33)
    // Every viewer sees the most advanced assessment available — not a frozen snapshot from their own review stage
    // Returns null when all scores are null — KPI excluded from weighted average (same as N/A) per POLICY §70
    return submission.management_score
      ?? submission.auditor_score
      ?? submission.hr_pms_score
      ?? submission.skip_level_score
      ?? submission.manager_score
      ?? submission.self_score
      ?? null;
  };

  // Calculate scores
  // Filtered KPIs for charts based on status filter
  const displayKpis = useMemo(() => {
    if (!kpis) return [];
    return statusFilter ? kpis.filter(k => k.status === statusFilter) : kpis;
  }, [kpis, statusFilter]);

  const scoreData = useMemo(() => {
    if (!displayKpis.length || !submissions) return { overallScore: 0, rating: 0, categoryScores: [], totalWeightedScore: 0, totalWeight: 0 };
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryMap = new Map<string, { 
      totalScore: number; 
      totalWeight: number; 
      color: string | null;
      dynamicWeightage: number;
    }>();
    
    displayKpis.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      const categoryName = kpi.kra_categories?.name || 'Other';
      const categoryColor = kpi.kra_categories?.color || null;
      
      const existing = categoryMap.get(categoryName) || { 
        totalScore: 0, 
        totalWeight: 0, 
        color: categoryColor,
        dynamicWeightage: 0
      };
      
      const weight = kpi.weightage || 0;
      existing.dynamicWeightage += weight;
      
      // Only contribute to scores if submission exists, not NA, and has at least one score (POLICY §70)
      if (submission && !submission.is_na) {
        const score = getRelevantScore(submission, kpi.status);
        if (score !== null && weight > 0) {
          totalWeightedScore += score * weight;
          totalWeight += weight;
          existing.totalScore += score * weight;
          existing.totalWeight += weight;
        }
      }
      
      categoryMap.set(categoryName, existing);
    });
    
    const overallRating = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const overallScore = (overallRating / 5) * 100;
    
    const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      percentage: data.totalWeight > 0 ? ((data.totalScore / data.totalWeight) / 5) * 100 : 0,
      color: data.color,
      weightage: data.dynamicWeightage,
    }));
    
    return { overallScore, rating: overallRating, categoryScores, totalWeightedScore, totalWeight };
  }, [displayKpis, submissions, submissionMap, viewLevel]);

  // Submit review mutation
  const submitReview = useMutation({
    mutationFn: async ({
      kpi_id,
      rating,
      score,
      remarks,
      evidence_url,
      evidence_urls,
      achieved_value,
      approve,
    }: {
      kpi_id: string;
      rating: RatingLevel;
      score: number;
      remarks: string;
      evidence_url?: string | null;
      evidence_urls?: string[];
      achieved_value?: number | null;
      approve: boolean;
    }) => {
      const updateData: any = {};
      const prefix = config.scoreFieldPrefix;
      
      updateData[`${prefix}_rating`] = rating;
      updateData[`${prefix}_score`] = score;
      updateData[`${prefix}_remarks`] = remarks;
      updateData[`${prefix}_evidence_url`] = evidence_url;
      updateData[`${prefix}_evidence_urls`] = evidence_urls;
      if (achieved_value !== undefined) {
        updateData[`${prefix}_achieved_value`] = achieved_value;
      }
      
      // When this approval moves KPI to 'approved', sync final score
      // regardless of which role is the terminal reviewer
      if (approve && config.forwardStatus === 'approved') {
        updateData.final_rating = rating;
        updateData.final_score = score;
      } else {
        // Clear stale final_score/final_rating to prevent displaying
        // outdated values from import or prior stages
        updateData.final_score = null;
        updateData.final_rating = null;
      }

      // Clear downstream reviewer fields to prevent stale data after rollback re-submissions
      const STAGE_FIELD_MAP: Record<string, string[]> = {
        manager_check: ['manager_score', 'manager_rating', 'manager_remarks', 'manager_evidence_url', 'manager_achieved_value'],
        skip_level_check: ['skip_level_score', 'skip_level_rating', 'skip_level_remarks', 'skip_level_evidence_url', 'skip_level_achieved_value'],
        hr_pms_review: ['hr_pms_score', 'hr_pms_rating', 'hr_pms_remarks', 'hr_pms_evidence_url', 'hr_pms_achieved_value'],
        audit: ['auditor_score', 'auditor_rating', 'auditor_remarks', 'auditor_evidence_url', 'auditor_achieved_value'],
        management_review: ['management_score', 'management_rating', 'management_remarks', 'management_evidence_url', 'management_achieved_value'],
      };
      const currentStageIdx = effectiveStages.indexOf(config.activeReviewStage);
      if (currentStageIdx >= 0) {
        effectiveStages.forEach((stage, idx) => {
          if (idx > currentStageIdx && STAGE_FIELD_MAP[stage]) {
            STAGE_FIELD_MAP[stage].forEach(field => { updateData[field] = null; });
          }
        });
      }

      const { data: updateResult, error: submissionError } = await supabase
        .from('review_submissions')
        .update(updateData)
        .eq('kpi_id', kpi_id)
        .select();

      if (submissionError) throw submissionError;
      if (!updateResult || updateResult.length === 0) {
        throw new Error(`Unable to submit ${viewLevel} review. You may not have permission.`);
      }

      const newStatus = approve ? config.forwardStatus : config.activeReviewStage;
      const { data: kpiUpdateData, error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id)
        .select();

      if (kpiError) throw kpiError;
      if (!kpiUpdateData || kpiUpdateData.length === 0) {
        throw new Error('Unable to update KPI status. Permission denied.');
      }

      // Log the action
      if (user?.id) {
        const action = approve 
          ? `${viewLevel.toUpperCase()}_${viewLevel === 'management' ? 'APPROVED' : 'FORWARDED'}`
          : `${viewLevel.toUpperCase()}_REVIEWED`;
        
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action,
          performed_by: user.id,
          new_value: { [`${prefix}_rating`]: rating, [`${prefix}_score`]: score, [`${prefix}_remarks`]: remarks },
          metadata: { timestamp: new Date().toISOString() },
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ 
        title: variables.approve 
          ? `${viewLevel === 'management' ? 'Approved' : 'Forwarded'} successfully`
          : 'Review saved'
      });
      setReviewSheetOpen(false);
      if (selectedKpi) clearDraft(selectedKpi.id);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });

  // Send back mutation
  const sendBack = useMutation({
    mutationFn: async ({
      kpi_id,
      target,
      reason,
    }: {
      kpi_id: string;
      target: string;
      reason: string;
    }) => {
      const newStatus = resolveSendBackStatus(target, viewLevel as Exclude<ScorecardViewLevel, 'self'>, effectiveStages);

      const { data: updatedRows, error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id)
        .select('id');

      if (kpiError) throw kpiError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Failed to update KPI status. You may not have permission to perform this action.');
      }

      // Cascading clear: clear ALL downstream fields from the target status onward
      // This mirrors the admin step-back logic in useAdminDataEntry.ts
      const clearFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
      // Use employee's actual effectiveStages instead of hardcoded 8-stage order
      // so field-clearing logic works correctly for all custom pipeline templates.
      const statusOrder = effectiveStages;
      const targetIdx = statusOrder.indexOf(newStatus);

      // When sending back to employee (kra_set), only reset kpi_status
      // but PRESERVE self-level data so employee can see what they submitted
      if (newStatus === 'kra_set') {
        clearFields.kpi_status = 'open';
      }

      // Clear manager fields when target is before manager_check (or stage absent from pipeline)
      const managerIdx = statusOrder.indexOf('manager_check');
      if (managerIdx === -1 || targetIdx < managerIdx) {
        clearFields.manager_rating = null;
        clearFields.manager_score = null;
        clearFields.manager_remarks = null;
        clearFields.manager_evidence_url = null;
        clearFields.manager_achieved_value = null;
      }

      // Clear skip_level fields when target is before skip_level_check (or stage absent)
      const skipIdx = statusOrder.indexOf('skip_level_check');
      if (skipIdx === -1 || targetIdx < skipIdx) {
        clearFields.skip_level_rating = null;
        clearFields.skip_level_score = null;
        clearFields.skip_level_remarks = null;
        clearFields.skip_level_evidence_url = null;
        clearFields.skip_level_achieved_value = null;
      }

      // Clear hr_pms fields when target is before hr_pms_review (or stage absent)
      const hrPmsIdx = statusOrder.indexOf('hr_pms_review');
      if (hrPmsIdx === -1 || targetIdx < hrPmsIdx) {
        clearFields.hr_pms_rating = null;
        clearFields.hr_pms_score = null;
        clearFields.hr_pms_remarks = null;
        clearFields.hr_pms_evidence_url = null;
        clearFields.hr_pms_achieved_value = null;
      }

      // Clear auditor fields when target is before audit (or stage absent)
      const auditIdx = statusOrder.indexOf('audit');
      if (auditIdx === -1 || targetIdx < auditIdx) {
        clearFields.auditor_rating = null;
        clearFields.auditor_score = null;
        clearFields.auditor_remarks = null;
        clearFields.auditor_evidence_url = null;
        clearFields.auditor_achieved_value = null;
      }

      // Clear management fields when target is before management_review (or stage absent)
      const mgmtIdx = statusOrder.indexOf('management_review');
      if (mgmtIdx === -1 || targetIdx < mgmtIdx) {
        clearFields.management_rating = null;
        clearFields.management_score = null;
        clearFields.management_remarks = null;
        clearFields.management_evidence_url = null;
        clearFields.management_achieved_value = null;
      }

      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update(clearFields)
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      // Log the action
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: `${viewLevel.toUpperCase()}_SENT_BACK_TO_${target.toUpperCase()}`,
          performed_by: user.id,
          new_value: { reason, target },
          metadata: { sent_back_at: new Date().toISOString() },
        });

        // Create a kpi_queries record so the send-back reason is discoverable
        const employeeId = kpis?.find(k => k.id === kpi_id)?.employee_id;
        if (employeeId) {
          await supabase.from('kpi_queries').insert({
            kpi_id,
            raised_by: user.id,
            raised_to: employeeId,
            reason: `[SENT BACK] ${reason}`,
            entity_type: 'kpi',
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            query_type: 'send_back',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-journey-audit-logs'] });
      toast({ title: 'KPI sent back successfully' });
      setSendBackDialogOpen(false);
      setReviewSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back', description: error.message, variant: 'destructive' });
    },
  });

  // Open review sheet
  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    
    // Get the reviewer's OWN score (not inherited)
    const ownScoreFieldMap: Record<string, number | null | undefined> = {
      manager: existing?.manager_score,
      skip_level: (existing as any)?.skip_level_score,
      hr_pms: (existing as any)?.hr_pms_score,
      auditor: existing?.auditor_score,
      management: existing?.management_score,
    };
    const ownScore = ownScoreFieldMap[viewLevel] ?? null;

    // Determine the achieved value for this level
    const achievedVal = (existing as any)?.[`${config.scoreFieldPrefix}_achieved_value`] ?? 
      existing?.achieved_value ?? 
      (kpi.is_org_level ? getOrgKpiValue(kpi)?.achieved_value ?? null : null);

    let prevScore: number | null = ownScore;

    // If the reviewer hasn't scored yet (own score is null), recalculate from achieved value
    if (prevScore === null && achievedVal !== null && achievedVal !== '') {
      const numVal = typeof achievedVal === 'number' ? achievedVal : parseFloat(String(achievedVal));
      if (!isNaN(numVal)) {
        const result = calculateRating(
          numVal,
          kpi.target_value,
          { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
          kpi.criteria || 'Higher is Better',
          kpi.weightage || 0,
          (kpi.uom_type as any) || 'numeric',
          kpi.qualitative_options as any,
          kpi.uom,
          (kpi as any).threshold_mode || 'absolute'
        );
        prevScore = result.rating;
      }
    }

    // Fallback: if still null, inherit from previous level (legacy behavior)
    if (prevScore === null) {
      const fallbackMap: Record<string, () => number | null> = {
        manager: () => kpi.is_org_level ? existing?.self_score ?? null : null,
        skip_level: () => existing?.manager_score ?? null,
        hr_pms: () => (existing as any)?.skip_level_score ?? null,
        auditor: () => existing?.manager_score ?? null,
        management: () => existing?.auditor_score ?? null,
      };
      prevScore = (fallbackMap[viewLevel] || (() => null))();
    }
    
    setReviewerScore(prevScore);
    setReviewerRemarks((existing as any)?.[`${config.scoreFieldPrefix}_remarks`] || '');
    const existingUrls = (existing as any)?.[`${config.scoreFieldPrefix}_evidence_urls`];
    setReviewerEvidenceUrls(
      Array.isArray(existingUrls) && existingUrls.length > 0
        ? existingUrls
        : (existing as any)?.[`${config.scoreFieldPrefix}_evidence_url`] 
          ? [(existing as any)[`${config.scoreFieldPrefix}_evidence_url`]] 
          : []
    );
    setReviewerAchievedValue(
      (existing as any)?.[`${config.scoreFieldPrefix}_achieved_value`] ?? 
      existing?.achieved_value ?? 
      (kpi.is_org_level ? getOrgKpiValue(kpi)?.achieved_value ?? null : null)
    );
    
    // Reset state
    setReviewerAgrees(null);
    setDailyOverrides(new Map());
    setOverrideReason('');
    setNaConfirmed(false);
    setNaRemarks('');
    setReviewerMarkNa(false);
    setMarkNaRemarks('');
    setNaOverridden(false);
    setOverrideNaRemarks('');

    // Check for saved draft
    const draftKey = `review-draft-${kpi.id}-${viewLevel}`;
    try {
      const savedDraft = sessionStorage.getItem(draftKey);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.score !== undefined) setReviewerScore(draft.score);
        if (draft.remarks) setReviewerRemarks(draft.remarks);
        if (draft.achievedValue !== undefined) setReviewerAchievedValue(draft.achievedValue);
        if (draft.evidenceUrls) setReviewerEvidenceUrls(draft.evidenceUrls);
        console.log('[draft] Restored review draft for KPI:', kpi.id);
      }
    } catch { /* ignore parse errors */ }

    setReviewSheetOpen(true);
  };

  // Auto-save draft when review state changes
  useEffect(() => {
    if (!reviewSheetOpen || !selectedKpi) return;
    const draftKey = `review-draft-${selectedKpi.id}-${viewLevel}`;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({
        score: reviewerScore,
        remarks: reviewerRemarks,
        achievedValue: reviewerAchievedValue,
        evidenceUrls: reviewerEvidenceUrls,
        savedAt: Date.now(),
      }));
    } catch { /* sessionStorage full — ignore */ }
  }, [reviewSheetOpen, selectedKpi?.id, reviewerScore, reviewerRemarks, reviewerAchievedValue, reviewerEvidenceUrls, viewLevel]);

  // Clear draft on successful submit
  const clearDraft = (kpiId: string) => {
    try { sessionStorage.removeItem(`review-draft-${kpiId}-${viewLevel}`); } catch { /* ignore */ }
  };

  // Handle submit review
  const handleSubmitReview = async (approve: boolean) => {
    if (!selectedKpi) return;
    
    const submission = submissionMap.get(selectedKpi.id);
    const isNaKpi = submission?.is_na || false;
    
    // Reviewer-initiated N/A marking
    if (reviewerMarkNa && !isNaKpi) {
      if (!markNaRemarks.trim()) return;
      
      // Set is_na and na_marked_by_role on submission
      const remarkField = `${config.scoreFieldPrefix}_remarks`;
      const updateData: any = {
        is_na: true,
        na_marked_by_role: viewLevel,
        [remarkField]: markNaRemarks,
        // Explicitly clear final_score/final_rating for N/A KPIs moving to approved
        ...(approve && config.forwardStatus === 'approved' ? { final_score: null, final_rating: null } : {}),
      };
      
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update(updateData)
        .eq('kpi_id', selectedKpi.id);
      
      if (submissionError) {
        toast({ title: 'Failed to mark N/A', description: submissionError.message, variant: 'destructive' });
        return;
      }
      
      // Advance status
      const newStatus = approve ? config.forwardStatus : config.activeReviewStage;
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', selectedKpi.id);
      
      if (kpiError) {
        toast({ title: 'Failed to update status', description: kpiError.message, variant: 'destructive' });
        return;
      }
      
      // Audit log
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: `${viewLevel.toUpperCase()}_MARKED_NA`,
          performed_by: user.id,
          new_value: { na_remarks: markNaRemarks, na_marked_by_role: viewLevel },
          metadata: { marked_at: new Date().toISOString() },
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI marked as N/A and forwarded' });
      setReviewSheetOpen(false);
      clearDraft(selectedKpi.id);
      return;
    }
    
    // For existing N/A KPIs — override or confirm
    if (isNaKpi) {
      // N/A Override: reviewer decides KPI IS applicable
      if (naOverridden) {
        if (!overrideNaRemarks.trim()) return;
        if (reviewerScore === null) return;
        
        // Clear is_na and submit score
        const prefix = config.scoreFieldPrefix;
        const updateData: any = {
          is_na: false,
          na_marked_by_role: null,
          [`${prefix}_rating`]: scoreToRating(reviewerScore),
          [`${prefix}_score`]: reviewerScore,
          [`${prefix}_remarks`]: overrideNaRemarks,
          [`${prefix}_evidence_url`]: reviewerEvidenceUrls[0] || null,
          [`${prefix}_evidence_urls`]: reviewerEvidenceUrls,
        };
        if (reviewerAchievedValue !== undefined && reviewerAchievedValue !== null) {
          updateData[`${prefix}_achieved_value`] = typeof reviewerAchievedValue === 'number' 
            ? reviewerAchievedValue 
            : parseFloat(reviewerAchievedValue as string) || null;
        }
        // When this approval moves KPI to 'approved', sync final score
        if (approve && config.forwardStatus === 'approved') {
          updateData.final_rating = scoreToRating(reviewerScore);
          updateData.final_score = reviewerScore;
        }
        
        const { error: submissionError } = await supabase
          .from('review_submissions')
          .update(updateData)
          .eq('kpi_id', selectedKpi.id);
        
        if (submissionError) {
          toast({ title: 'Failed to override N/A', description: submissionError.message, variant: 'destructive' });
          return;
        }
        
        const newStatus = approve ? config.forwardStatus : config.activeReviewStage;
        const { error: kpiError } = await supabase
          .from('kpis')
          .update({ status: newStatus as any })
          .eq('id', selectedKpi.id);
        
        if (kpiError) {
          toast({ title: 'Failed to update status', description: kpiError.message, variant: 'destructive' });
          return;
        }
        
        if (user?.id) {
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: selectedKpi.id,
            action: `${viewLevel.toUpperCase()}_NA_OVERRIDDEN`,
            performed_by: user.id,
            new_value: { override_remarks: overrideNaRemarks, score: reviewerScore },
            metadata: { overridden_at: new Date().toISOString() },
          });
        }
        
        queryClient.invalidateQueries({ queryKey: ['kpis'] });
        queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
        queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
        toast({ title: 'N/A overridden — KPI scored and forwarded' });
        setReviewSheetOpen(false);
        clearDraft(selectedKpi.id);
        return;
      }
      
      // N/A Confirmation (original flow)
      if (!naConfirmed) return;
      
      // Explicitly set final_score/final_rating to null for N/A KPIs moving to approved
      if (approve && config.forwardStatus === 'approved') {
        await supabase
          .from('review_submissions')
          .update({ final_score: null, final_rating: null })
          .eq('kpi_id', selectedKpi.id);
      }
      
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: `${viewLevel.toUpperCase()}_NA_CONFIRMED`,
          performed_by: user.id,
          new_value: { na_remarks: naRemarks },
          metadata: { confirmed_at: new Date().toISOString() },
        });
      }
      
      const newStatus = approve ? config.forwardStatus : config.activeReviewStage;
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', selectedKpi.id);
      
      if (kpiError) {
        toast({ title: 'Failed to process N/A KPI', description: kpiError.message, variant: 'destructive' });
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: approve ? 'N/A KPI approved' : 'N/A KPI confirmed' });
      setReviewSheetOpen(false);
      clearDraft(selectedKpi.id);
      return;
    }
    
    // Regular KPI flow
    if (reviewerScore === null) return;

    // Validate mandatory remarks for this review level
    const isRemarksMandatory = remarksMandatory[viewLevel as keyof typeof remarksMandatory];
    if (isRemarksMandatory && !reviewerRemarks.trim()) {
      const levelLabel = viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1).replace(/_/g, ' ');
      toast({ title: 'Remarks Required', description: `Remarks are required for ${levelLabel} review`, variant: 'destructive' });
      return;
    }
    
    const isDailyBinary = selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary';
    
    // Handle daily binary overrides
    if (isDailyBinary) {
      if (reviewerAgrees === false && dailyOverrides.size > 0) {
        const overrideEntries = Array.from(dailyOverrides.entries()).map(([date, value]) => ({
          sub_period_value: date,
          achieved_value: value,
          original_value: null,
        }));
        
        const originalScore = submission?.[config.previousScoreField] || null;
        
        if (viewLevel === 'manager') {
          await managerOverride.saveOverrides.mutateAsync({
            kpi_id: selectedKpi.id,
            employee_id: employee.id,
            overrides: overrideEntries,
            reason: overrideReason,
            review_month: selectedPeriod,
            review_year: selectedYear,
            original_score: originalScore,
            new_score: reviewerScore,
          });
        } else {
          await reviewerOverride.saveOverrides.mutateAsync({
            kpi_id: selectedKpi.id,
            employee_id: employee.id,
            review_level: viewLevel as any,
            overrides: overrideEntries,
            reason: overrideReason,
            review_month: selectedPeriod,
            review_year: selectedYear,
            original_score: originalScore,
            new_score: reviewerScore,
          });
        }
      } else {
        // Accept previous level values
        if (viewLevel === 'manager') {
          await managerOverride.acceptEmployeeValues.mutateAsync({
            kpi_id: selectedKpi.id,
            review_month: selectedPeriod,
            review_year: selectedYear,
          });
        } else {
          await reviewerOverride.acceptPreviousLevel.mutateAsync({
            kpi_id: selectedKpi.id,
            review_level: viewLevel as any,
            review_month: selectedPeriod,
            review_year: selectedYear,
          });
        }
      }
    }
    
    // Org KPI override warning check
    if (selectedKpi.is_org_level) {
      const submission = submissionMap.get(selectedKpi.id);
      const previousScore = submission?.[config.previousScoreField] as number | null;
      if (previousScore !== null && previousScore !== undefined && reviewerScore !== previousScore) {
        setPendingApproveAction(approve);
        setOrgOverrideWarningOpen(true);
        return;
      }
    }

    const rating = scoreToRating(reviewerScore);
    submitReview.mutate({
      kpi_id: selectedKpi.id,
      rating,
      score: reviewerScore,
      remarks: reviewerRemarks,
      evidence_url: reviewerEvidenceUrls[0] || null,
      evidence_urls: reviewerEvidenceUrls,
      achieved_value: typeof reviewerAchievedValue === 'number' 
        ? reviewerAchievedValue 
        : reviewerAchievedValue ? parseFloat(reviewerAchievedValue) : null,
      approve,
    });
  };

  const handleOrgOverrideConfirm = () => {
    setOrgOverrideWarningOpen(false);
    if (selectedKpi && reviewerScore !== null && pendingApproveAction !== null) {
      const rating = scoreToRating(reviewerScore);
      submitReview.mutate({
        kpi_id: selectedKpi.id,
        rating,
        score: reviewerScore,
        remarks: reviewerRemarks,
        evidence_url: reviewerEvidenceUrls[0] || null,
        evidence_urls: reviewerEvidenceUrls,
        achieved_value: typeof reviewerAchievedValue === 'number' 
          ? reviewerAchievedValue 
          : reviewerAchievedValue ? parseFloat(reviewerAchievedValue) : null,
        approve: pendingApproveAction,
      });
    }
    setPendingApproveAction(null);
  };

  // Open send back dialog
  const openSendBackDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget(config.sendBackTargets[0]?.value || 'employee');
    setSendBackDialogOpen(true);
  };

  // Handle send back
  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBack.mutate({
      kpi_id: selectedKpi.id,
      target: sendBackTarget,
      reason: sendBackReason,
    });
  };

  // Handle raise query
  const [queryEvidenceUrl, setQueryEvidenceUrl] = useState('');
  const handleRaiseQuery = () => {
    if (!selectedKpi || !queryReason.trim()) return;
    raiseQuery.mutate({
      kpi_id: selectedKpi.id,
      raised_to: employee.id,
      reason: queryReason,
      entity_type: 'kpi',
      evidence_url: queryEvidenceUrl || undefined,
    }, {
      onSuccess: () => { setQueryDialogOpen(false); setQueryEvidenceUrl(''); },
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleDailyExpand = (kpiId: string) => {
    setExpandedDailyKpis(prev => {
      const newSet = new Set(prev);
      if (newSet.has(kpiId)) newSet.delete(kpiId);
      else newSet.add(kpiId);
      return newSet;
    });
  };

  // Determine view type for KpiDetailsTable
  const viewType = viewLevel === 'self' ? 'my-kpis'
               : viewLevel === 'manager' ? 'team-review'
               : viewLevel === 'auditor' ? 'audit'
               : viewLevel === 'skip_level' ? 'skip-level-review'
               : viewLevel === 'hr_pms' ? 'hr-pms-review'
               : 'management';

  // Check if KPI is reviewable at current level
  const isReviewable = (kpi: KPI) => config.reviewableStatuses.includes(kpi.status || '');

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  const RoleIcon = config.roleIcon;

  return (
    <div className="space-y-6">
      {/* 1. Profile + Filters Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Profile Card */}
        {isSelfMode ? (
          <ProfileCard
            profile={{
              full_name: employee.full_name,
              designation: employee.designation,
              employee_code: employee.employee_code,
              avatar_url: employee.avatar_url,
              email: employee.email,
            }}
            department={employee.departments?.name}
            compact
          />
        ) : (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 border-2 border-primary/20">
              <AvatarImage src={employee.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {getInitials(employee.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold truncate">{employee.full_name || employee.email}</h1>
                {employee.employee_code && (
                  <span className="text-xs sm:text-sm text-muted-foreground">({employee.employee_code})</span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {employee.designation || 'Employee'}
                {employee.departments?.name && (
                  <span><span className="text-border"> | </span>{employee.departments.name}</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 flex-shrink-0">
          <ReviewPeriodSelectorEnhanced
            value={periodSelection}
            onChange={onPeriodSelectionChange}
          />
          
          <div className="h-6 w-px bg-border hidden sm:block" />

          {isSelfMode && availableSelfCategories.length > 0 && (
            <>
              <Select value={activeCategory} onValueChange={setActiveCategory}>
                <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All" className="text-xs">All Categories</SelectItem>
                  {availableSelfCategories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.name} className="text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color || 'hsl(var(--primary))' }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="h-6 w-px bg-border hidden sm:block" />
            </>
          )}
          
          <Badge variant="outline" className="text-xs h-6 px-2 ml-auto whitespace-nowrap">
            {sortedKpis.length}/{kpis?.length || 0} KPIs
          </Badge>
        </div>
      </div>

      {/* 2. Performance Charts Row - 1:5 ratio matching Dashboard */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-6">
        {/* Overall Score Chart - Small (1/6) */}
        <Card className="md:col-span-1">
          <CardContent className="flex flex-col items-center pt-4">
            <div className="h-[120px] sm:h-[140px] w-full">
              <OverallScoreChart percentage={scoreData.overallScore} rating={scoreData.rating} />
            </div>
            {/* Weighted Score below donut */}
            <div className="text-center mt-2 pt-2 border-t border-border w-full">
              <p className="text-xs text-muted-foreground">Weighted Score</p>
              <p className="text-lg font-bold text-foreground">
                {scoreData.totalWeightedScore.toFixed(1)} 
                <span className="text-muted-foreground font-normal"> / {(scoreData.totalWeight * 5).toFixed(0)}</span>
              </p>
            </div>
            {/* Previous 3 months mini trend */}
            {selectedPeriod && selectedYear && (
              <PreviousMonthsScoreMini
                employeeId={employee.id}
                currentMonth={selectedPeriod}
                currentYear={selectedYear}
                currentScore={scoreData.rating}
                count={3}
              />
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown - Wide (5/6) */}
        <Card className="md:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Category</CardTitle>
            <CardDescription className="text-xs">Score breakdown across KRA categories</CardDescription>
          </CardHeader>
          <CardContent style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}>
            <CategoryScoreChart data={scoreData.categoryScores} sortBy={categorySortBy} onSortChange={setCategorySortBy} />
          </CardContent>
        </Card>
      </div>

      {/* Pending Period Alerts (self mode) */}
      {isSelfMode && pendingPeriods.length > 0 && (
        <div className="space-y-2">
          {pendingPeriods.map(pp => (
            <Alert key={pp.key} className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-amber-800 dark:text-amber-200">
                  You have <strong>{pp.count} pending KPI{pp.count > 1 ? 's' : ''}</strong> for {pp.month} {pp.year} that need your action.
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm"
                    className="h-7 text-xs border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900"
                    onClick={() => onPeriodSelectionChange({
                      ...periodSelection,
                      mode: 'single' as const,
                      selectedMonth: pp.month,
                      selectedYear: pp.year,
                      months: [pp.month],
                      periodRanges: [{ month: pp.month, year: pp.year }],
                    })}
                  >
                    Switch to {pp.month.substring(0, 3)} {pp.year}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600 dark:text-amber-400"
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

      {/* 3. Status Progress - Full Width Workflow Tracker (not compact) */}
      <WorkflowProgressTracker kpis={kpis || []} queries={queries || []} workflowStages={effectiveStages} activeFilter={statusFilter} onFilterChange={setStatusFilter} />


      {/* 4. KPI Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <CardTitle>KPI Details</CardTitle>
              <CardDescription>Click on a KPI to review and update scores</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {lastSelfReviewDate && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Self reviewed: {formatDate(lastSelfReviewDate)}
                </span>
              )}
              <KraExportMenu
                kpis={kpis || []}
                employeeProfile={{
                  full_name: employee.full_name,
                  employee_code: employee.employee_code,
                  designation: employee.designation,
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
        <CardContent className="px-3 sm:px-6">
          {isMobile ? (
            <div className="space-y-3">
              {sortedKpis.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                const selfReviewHandler = (k: KPI) => { setSelfAutoOpenQueryHistory(false); setSelectedKpiForSelfReview(k); };
                return (
                  <MobileKpiCard
                    key={kpi.id}
                    kpi={kpi}
                    submission={submission}
                    viewType={viewType}
                    onAction={isSelfMode ? selfReviewHandler : openReviewSheet}
                    onView={isSelfMode ? selfReviewHandler : openReviewSheet}
                    onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
                    onSendBack={isSelfMode ? undefined : openSendBackDialog}
                    onToggleExpand={toggleDailyExpand}
                    isExpanded={expandedDailyKpis.has(kpi.id)}
                    getOrgKpiValue={getOrgKpiValue}
                    observationCount={observationCounts.get(kpi.id) || 0}
                  />
                );
              })}
              {sortedKpis.length === 0 && (
                <NoKpisPeriodHint
                  employeeId={employee.id}
                  selectedPeriod={selectedPeriod}
                  selectedYear={selectedYear}
                  periodSelection={periodSelection}
                  onPeriodSelectionChange={onPeriodSelectionChange}
                />
              )}
            </div>
          ) : (
            <KpiDetailsTable
              kpis={sortedKpis}
              submissionMap={submissionMap}
              queryMap={queryMap as Map<string, KpiQuery[]>}
              viewType={viewType}
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onReview={isSelfMode 
                ? (kpi: KPI) => { setSelfAutoOpenQueryHistory(false); setSelectedKpiForSelfReview(kpi); } 
                : openReviewSheet}
              onView={isSelfMode 
                ? (kpi: KPI) => { setSelfAutoOpenQueryHistory(false); setSelectedKpiForSelfReview(kpi); } 
                : openReviewSheet}
              onSendBack={isSelfMode ? undefined : openSendBackDialog}
              onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
              expandedKpis={expandedDailyKpis}
              onToggleExpand={toggleDailyExpand}
              workflowStages={effectiveStages}
              auditKpiAssignments={auditKpiAssignments}
              getOrgKpiValue={getOrgKpiValue}
              dataOwnerNames={dataOwnerNamesMap}
              observationCounts={observationCounts}
            />
          )}
        </CardContent>
      </Card>

      {/* Self Review Sheet - for self mode */}
      {isSelfMode && (
        <SelfReviewSheet
          open={!!selectedKpiForSelfReview}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedKpiForSelfReview(null);
              setSelfAutoOpenQueryHistory(false);
            }
          }}
          kpi={selectedKpiForSelfReview}
          allKpis={allKpis || []}
          submissionMap={submissionMap}
          allSubmissions={allSubmissions || []}
          subPeriodSubmissions={subPeriodSubmissions || []}
          subPeriodLoading={subPeriodLoading || false}
          orgKpiValuesMap={orgKpiValuesMap as any}
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          autoOpenQueryHistory={selfAutoOpenQueryHistory}
        />
      )}

      {/* Review Sheet (reviewer modes only) */}
      {!isSelfMode && (
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="pb-2 sm:pb-4">
            <SheetTitle className="text-base sm:text-lg">
              {selectedKpi && isReviewable(selectedKpi) ? config.title : 'View KPI Details'}
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">
              {selectedKpi && isReviewable(selectedKpi) 
                ? config.description
                : 'View submission details for this KPI'}
            </SheetDescription>
          </SheetHeader>

          {selectedKpi && (
            <div className="space-y-4 sm:space-y-6 py-4 sm:py-6">
              {/* KPI Review Panel */}
              <KpiReviewPanel
                kpi={selectedKpi}
                submission={submissionMap.get(selectedKpi.id) || null}
                allKpis={allKpis || []}
                allSubmissions={allSubmissions || []}
                queries={queryMap.get(selectedKpi.id) || []}
                viewLevel={viewLevel}
                currentUserId={user?.id}
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onOpenQueryHistory={() => setHistoryDialogOpen(true)}
                onOpenFullHistory={() => setTrackerModalOpen(true)}
                onOpenTimeline={() => setTimelineOpen(true)}
                workflowStages={effectiveStages}
                orgKpiEnteredByName={getOrgKpiValue(selectedKpi)?.entered_by_name}
                orgKpiDataOwnerNames={getOwnerNamesForKpi(dataOwnerNamesMap, selectedKpi)}
                orgAchievedValue={getOrgKpiValue(selectedKpi)?.achieved_value ?? null}
                employeeName={employee.full_name || undefined}
                employeeCode={employee.employee_code || undefined}
              />
              
              
              {/* Sent Back Banner */}
              <SentBackBanner kpiId={selectedKpi.id} />

              {/* N/A Confirmation Card - existing N/A (with override option) */}
              {submissionMap.get(selectedKpi.id)?.is_na && isReviewable(selectedKpi) && (
                <NaConfirmationCard
                  selfRemarks={(() => {
                    const sub = submissionMap.get(selectedKpi.id) as any;
                    if (!sub) return null;
                    const role = sub.na_marked_by_role;
                    if (role === 'manager') return sub.manager_remarks || null;
                    if (role === 'skip_level') return sub.skip_level_remarks || null;
                    if (role === 'hr_pms') return sub.hr_pms_remarks || null;
                    if (role === 'auditor') return sub.auditor_remarks || null;
                    if (role === 'management') return sub.management_remarks || null;
                    return sub.self_remarks || null;
                  })()}
                  confirmed={naConfirmed}
                  onConfirmChange={setNaConfirmed}
                  remarks={naRemarks}
                  onRemarksChange={setNaRemarks}
                  reviewerLevel={viewLevel === 'manager' ? 'Manager' : viewLevel === 'auditor' ? 'Auditor' : 'Management'}
                  naMarkedByRole={(submissionMap.get(selectedKpi.id) as any)?.na_marked_by_role || null}
                  naOverridden={naOverridden}
                  onOverrideNa={setNaOverridden}
                  overrideRemarks={overrideNaRemarks}
                  onOverrideRemarksChange={setOverrideNaRemarks}
                />
              )}
              
              {/* Reviewer-initiated Mark as N/A */}
              {!submissionMap.get(selectedKpi.id)?.is_na && isReviewable(selectedKpi) && (
                <NaConfirmationCard
                  selfRemarks={null}
                  confirmed={false}
                  onConfirmChange={() => {}}
                  remarks=""
                  onRemarksChange={() => {}}
                  reviewerLevel={viewLevel === 'manager' ? 'Manager' : viewLevel === 'auditor' ? 'Auditor' : 'Management'}
                  canMarkNa
                  reviewerMarkedNa={reviewerMarkNa}
                  onReviewerMarkNa={setReviewerMarkNa}
                  markNaRemarks={markNaRemarks}
                  onMarkNaRemarksChange={setMarkNaRemarks}
                />
              )}
              
              {/* Daily Submission Summary + Override - hidden when reviewer marks N/A or when N/A not overridden */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && (
                <DailySubmissionSummaryWithOverride 
                  kpi={selectedKpi} 
                  selectedPeriod={selectedPeriod} 
                  selectedYear={selectedYear}
                  viewLevel={viewLevel}
                  isReviewMode={isReviewable(selectedKpi)}
                  reviewerAgrees={reviewerAgrees}
                  onReviewerAgreesChange={setReviewerAgrees}
                  dailyOverrides={dailyOverrides}
                  onDailyOverridesChange={setDailyOverrides}
                  overrideReason={overrideReason}
                  onOverrideReasonChange={setOverrideReason}
                  reviewerScore={reviewerScore}
                  onReviewerScoreChange={setReviewerScore}
                  submissionMap={submissionMap}
                  config={config}
                />
              )}

              {/* Score Input - hidden when reviewer marks N/A or when N/A not overridden */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && isReviewable(selectedKpi) && !(selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary') && (
                <>
                  <AchievedValueScoreInput
                    kpi={selectedKpi}
                    achievedValue={reviewerAchievedValue}
                    score={reviewerScore}
                    onAchievedValueChange={setReviewerAchievedValue}
                    onScoreChange={(score, _rating) => setReviewerScore(score)}
                    label={`${viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1)} Score`}
                    reviewMonth={selectedPeriod}
                    reviewYear={selectedYear}
                  />

                  <div className="space-y-2">
                    <Label>{viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1)} Remarks{remarksMandatory[viewLevel as keyof typeof remarksMandatory] && <span className="text-destructive ml-1">*</span>}</Label>
                    <Textarea
                      value={reviewerRemarks}
                      onChange={(e) => setReviewerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {user?.id && (
                    <MultiFileUpload
                      userId={user.id}
                      contextId={selectedKpi.id}
                      folder="reviewer-evidence"
                      existingUrls={reviewerEvidenceUrls}
                      onUploadComplete={(urls) => setReviewerEvidenceUrls(urls)}
                      maxFiles={5}
                    />
                  )}
                </>
              )}
              
              {/* Remarks for Daily Binary - hidden when reviewer marks N/A or N/A not overridden */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && isReviewable(selectedKpi) && selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary' && reviewerAgrees !== null && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1)} Remarks{remarksMandatory[viewLevel as keyof typeof remarksMandatory] && <span className="text-destructive ml-1">*</span>}</Label>
                    <Textarea
                      value={reviewerRemarks}
                      onChange={(e) => setReviewerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {user?.id && (
                    <MultiFileUpload
                      userId={user.id}
                      contextId={selectedKpi.id}
                      folder="reviewer-evidence"
                      existingUrls={reviewerEvidenceUrls}
                      onUploadComplete={(urls) => setReviewerEvidenceUrls(urls)}
                      maxFiles={5}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rollback Request Banner - shown to reviewers when a pending request exists */}
          {selectedKpi && pendingRollback && isReviewable(selectedKpi) && (
            <RollbackRequestBanner request={pendingRollback} />
          )}

          <SheetFooter className="flex-col sm:flex-row gap-2 sm:justify-between mt-4 pb-4">
            {selectedKpi && isReviewable(selectedKpi) ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReviewSheetOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                    onClick={() => selectedKpi && openSendBackDialog(selectedKpi)}
                  >
                    <Undo2 className="h-4 w-4 mr-2" />
                    Send Back
                  </Button>
                  {['manager', 'auditor', 'skip_level', 'hr_pms', 'management'].includes(viewLevel) && (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                      onClick={() => {
                        if (selectedKpi) {
                          setQueryReason('');
                          setQueryEvidenceUrl('');
                          setQueryDialogOpen(true);
                        }
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Raise Query
                    </Button>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {(!submissionMap.get(selectedKpi?.id || '')?.is_na || naOverridden) && !reviewerMarkNa && (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => handleSubmitReview(false)}
                      disabled={reviewerScore === null || submitReview.isPending}
                    >
                      {submitReview.isPending ? 'Saving...' : 'Save Draft'}
                    </Button>
                  )}
                  <Button
                    variant="default"
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                    onClick={() => handleSubmitReview(true)}
                    disabled={
                      reviewerMarkNa ? !markNaRemarks.trim() :
                      (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden) ? (!overrideNaRemarks.trim() || reviewerScore === null) :
                      submissionMap.get(selectedKpi?.id || '')?.is_na ? !naConfirmed :
                      (reviewerScore === null || 
                       submitReview.isPending || 
                       isSavingOverrides ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && reviewerAgrees === null) ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && reviewerAgrees === false && !overrideReason.trim()))
                    }
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {reviewerMarkNa 
                      ? 'Mark N/A & Forward'
                      : (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden)
                        ? 'Override N/A & Forward'
                        : submissionMap.get(selectedKpi?.id || '')?.is_na 
                          ? 'Confirm N/A' 
                          : isSavingOverrides ? 'Saving...' : submitReview.isPending ? 'Processing...' : config.actionLabel}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 w-full justify-between">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReviewSheetOpen(false)}>
                  Close
                </Button>
                {/* Request Rollback button in read-only mode */}
                {selectedKpi && selectedKpi.status !== 'approved' && !pendingRollback && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                    onClick={() => setRollbackDialogOpen(true)}
                  >
                    <Undo2 className="h-4 w-4 mr-1" />
                    Request Rollback
                  </Button>
                )}
                {selectedKpi && pendingRollback && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Rollback requested
                  </span>
                )}
              </div>
            )}
          </SheetFooter>
      </SheetContent>
      </Sheet>
      )}

      {/* Query Dialog */}
      {['manager', 'auditor', 'skip_level', 'hr_pms', 'management'].includes(viewLevel) && (
        <Dialog open={queryDialogOpen} onOpenChange={setQueryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Raise Query</DialogTitle>
              <DialogDescription>
                Send a query to the employee about this KPI
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Query Reason</Label>
                <Textarea
                  value={queryReason}
                  onChange={(e) => setQueryReason(e.target.value)}
                  placeholder="Describe your query..."
                  rows={3}
                />
              </div>
              {user?.id && selectedKpi && (
                <EvidenceUpload
                  userId={user.id}
                  kpiId={selectedKpi.id}
                  existingUrl={queryEvidenceUrl || null}
                  onUploadComplete={setQueryEvidenceUrl}
                />
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setQueryDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleRaiseQuery} disabled={!queryReason.trim() || raiseQuery.isPending}>
                <MessageSquare className="h-4 w-4 mr-2" />
                {raiseQuery.isPending ? 'Sending...' : 'Raise Query'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back KPI</DialogTitle>
            <DialogDescription>
              Return this KPI to a previous stage for revision
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {config.sendBackTargets.length > 1 && (
              <div className="space-y-2">
                <Label>Send Back To</Label>
                <Select value={sendBackTarget} onValueChange={setSendBackTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.sendBackTargets.map(target => (
                      <SelectItem key={target.value} value={target.value}>
                        {target.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason for Send Back</Label>
              <Textarea
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                placeholder="Explain why this KPI needs revision..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleSendBack} 
              disabled={!sendBackReason.trim() || sendBack.isPending}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {sendBack.isPending ? 'Sending...' : 'Send Back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Logic Modal */}
      <KpiLogicModal
        isOpen={logicModalOpen}
        onClose={() => setLogicModalOpen(false)}
        kpi={selectedKpi}
      />

      {/* KPI Tracker Modal */}
      <KpiTrackerModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        kpi={selectedKpi}
        allKpis={allKpis || []}
        submissions={allSubmissions || []}
        workflowStages={effectiveStages}
      />

      {/* Query History Dialog */}
      <QueryHistoryDialog
        kpiId={selectedKpi?.id || ''}
        kpiName={selectedKpi?.kpi_name || ''}
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
      />

      {/* KPI Timeline */}
      <KpiTimeline
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        kpi={selectedKpi}
      />

      {/* Org KPI Send Back Dialog handled in KpiReviewPanel */}

      {/* Rollback Request Dialog - for read-only mode */}
      {selectedKpi && (
        <RollbackRequestDialog
          open={rollbackDialogOpen}
          onOpenChange={setRollbackDialogOpen}
          kpiId={selectedKpi.id}
          kpiName={selectedKpi.kpi_name}
          currentStatus={selectedKpi.status}
          workflowStages={effectiveStages}
          notifyUserId={employee.id}
          stagesLoading={stagesLoading}
        />
      )}
      {/* Org KPI Rating Override Warning */}
      <OrgKpiRatingOverrideWarning
        open={orgOverrideWarningOpen}
        onConfirm={handleOrgOverrideConfirm}
        onCancel={() => { setOrgOverrideWarningOpen(false); setPendingApproveAction(null); }}
        kpiName={selectedKpi?.kpi_name || ''}
        originalScore={(() => {
          const sub = selectedKpi ? submissionMap.get(selectedKpi.id) : null;
          return (sub?.[config.previousScoreField] as number) ?? 0;
        })()}
        originalEnteredBy={(() => {
          if (!selectedKpi?.is_org_level) return null;
          const orgVal = getOrgKpiValue(selectedKpi);
          return orgVal?.entered_by_name || null;
        })()}
        newScore={reviewerScore ?? 0}
      />
    </div>
  );
}

// Helper wrapper for Daily Submission Summary with override support
function DailySubmissionSummaryWithOverride({ 
  kpi, 
  selectedPeriod, 
  selectedYear,
  viewLevel,
  isReviewMode,
  reviewerAgrees,
  onReviewerAgreesChange,
  dailyOverrides,
  onDailyOverridesChange,
  overrideReason,
  onOverrideReasonChange,
  reviewerScore,
  onReviewerScoreChange,
  submissionMap,
  config,
}: { 
  kpi: KPI; 
  selectedPeriod: string; 
  selectedYear: number;
  viewLevel: ScorecardViewLevel;
  isReviewMode: boolean;
  reviewerAgrees: boolean | null;
  onReviewerAgreesChange: (agrees: boolean | null) => void;
  dailyOverrides: Map<string, number>;
  onDailyOverridesChange: (overrides: Map<string, number>) => void;
  overrideReason: string;
  onOverrideReasonChange: (reason: string) => void;
  reviewerScore: number | null;
  onReviewerScoreChange: (score: number | null) => void;
  submissionMap: Map<string, any>;
  config: { scoreFieldPrefix: string; previousScoreField: string };
}) {
  const { data: submissions } = useSubPeriodSubmissions(
    kpi.frequency === 'Daily' ? kpi.id : undefined, 
    selectedPeriod, 
    selectedYear
  );
  
  const isDailyBinary = kpi.frequency === 'Daily' && kpi.uom_type === 'binary';
  const existingSubmission = submissionMap.get(kpi.id);
  const previousScore = existingSubmission?.[config.previousScoreField] || null;
  
  // Calculate score when reviewer agrees or disagrees
  React.useEffect(() => {
    if (!isDailyBinary || !isReviewMode) return;
    
    if (reviewerAgrees === true) {
      onReviewerScoreChange(previousScore);
    } else if (reviewerAgrees === false && submissions) {
      const result = viewLevel === 'manager' 
        ? calculateOverriddenScore(submissions, dailyOverrides, selectedPeriod, selectedYear)
        : calculateReviewerOverriddenScore(submissions, dailyOverrides, selectedPeriod, selectedYear);
      onReviewerScoreChange(result.score);
    }
  }, [reviewerAgrees, dailyOverrides, submissions, previousScore, isDailyBinary, isReviewMode, selectedPeriod, selectedYear, onReviewerScoreChange, viewLevel]);
  
  if (kpi.frequency !== 'Daily' || !submissions || submissions.length === 0) {
    return null;
  }
  
  // getScoreLabel and getScoreBadgeClass imported from reviewConstants
  
  return (
    <div className="space-y-4">
      <DailySubmissionSummary
        kpiId={kpi.id}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        submissions={submissions}
        uom={kpi.uom}
        uomType={kpi.uom_type}
        qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
        kpiStatus={kpi.status}
      />
      
      {isDailyBinary && isReviewMode && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Do you agree with the {viewLevel === 'manager' ? "employee's" : "previous level's"} daily submissions?
            </Label>
            <div className="flex gap-2">
              <Button
                variant={reviewerAgrees === true ? 'default' : 'outline'}
                onClick={() => onReviewerAgreesChange(true)}
                className={reviewerAgrees === true ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              >
                <Check className="h-4 w-4 mr-2" />
                Yes - Accept Score
              </Button>
              <Button
                variant={reviewerAgrees === false ? 'default' : 'outline'}
                onClick={() => onReviewerAgreesChange(false)}
                className={reviewerAgrees === false ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                No - Override Entries
              </Button>
            </div>
          </div>
          
          {reviewerAgrees === false && (
            viewLevel === 'manager' ? (
              <ManagerDailyOverrideEditor
                kpiId={kpi.id}
                reviewMonth={selectedPeriod}
                reviewYear={selectedYear}
                submissions={submissions}
                overrides={dailyOverrides}
                onOverridesChange={onDailyOverridesChange}
                overrideReason={overrideReason}
                onReasonChange={onOverrideReasonChange}
                originalScore={previousScore}
              />
            ) : (
              <ReviewLevelOverrideEditor
                kpiId={kpi.id}
                reviewMonth={selectedPeriod}
                reviewYear={selectedYear}
                submissions={submissions}
                overrides={dailyOverrides}
                onOverridesChange={onDailyOverridesChange}
                overrideReason={overrideReason}
                onReasonChange={onOverrideReasonChange}
                originalScore={previousScore}
                reviewLevel={viewLevel as Exclude<ScorecardViewLevel, 'self'>}
              />
            )
          )}
          
          {reviewerAgrees !== null && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {reviewerAgrees === false ? 'Recalculated Score' : 'Score (Accepted)'}
                </span>
                <Badge className={getScoreBadgeClass(reviewerScore)}>
                  {reviewerScore ?? '—'} - {getScoreLabel(reviewerScore)}
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}

// Helper component: shows a hint when no KPIs exist for the selected period
function NoKpisPeriodHint({
  employeeId,
  selectedPeriod,
  selectedYear,
  periodSelection,
  onPeriodSelectionChange,
}: {
  employeeId: string;
  selectedPeriod: string | undefined;
  selectedYear: number | undefined;
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
}) {
  const { data: periods } = useEmployeeKpiPeriods(employeeId);

  const alternatePeriods = periods?.filter(
    p => !(p.review_period === selectedPeriod && p.review_year === selectedYear)
  ) || [];

  const switchToPeriod = (period: { review_period: string; review_year: number }) => {
    onPeriodSelectionChange({
      ...periodSelection,
      selectedMonth: period.review_period,
      selectedYear: period.review_year,
      months: [period.review_period],
      periodRanges: [{ month: period.review_period, year: period.review_year }],
    });
  };

  return (
    <div className="text-center py-8 space-y-3">
      <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/50" />
      <p className="text-muted-foreground font-medium">
        No KPIs found for {selectedPeriod} {selectedYear}
      </p>
      {alternatePeriods.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            This employee has KPIs in other periods:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {alternatePeriods.slice(0, 5).map(p => (
              <Button
                key={`${p.review_period}-${p.review_year}`}
                variant="outline"
                size="sm"
                onClick={() => switchToPeriod(p)}
              >
                {p.review_period} {p.review_year}
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {p.statuses.length} KPIs
                </Badge>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

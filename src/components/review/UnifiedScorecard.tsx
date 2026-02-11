import React, { useState, useMemo, useEffect } from 'react';
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
import { useKpisByEmployee, useReviewSubmissions, useApproveKpi, useRaiseQuery, useKpiQueries, useSendBackKpi, RatingLevel, KPI, KpiQuery } from '@/hooks/useKpis';
import { useSubPeriodSubmissions, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
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
import { CategoryScoreChart } from '@/components/dashboard/CategoryScoreChart';
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { KpiSortControl } from '@/components/ui/KpiSortControl';
import { QueryHistoryDialog } from '@/components/review/QueryHistoryDialog';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
import { SendBackOrgKpiDialog } from '@/components/review/SendBackOrgKpiDialog';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Lock, MessageSquare, Undo2, Check, Eye, ChevronDown, ChevronUp, History, Edit2, Send, Shield, Briefcase, User
} from 'lucide-react';
import { 
  kpiStatusColors, 
  kpiStatusLabels,
  statusColors,
  statusLabels,
  ratingOptions
} from '@/lib/reviewConstants';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { NaConfirmationCard } from '@/components/review/NaConfirmationCard';

// View level type - determines behavior and data access
export type ScorecardViewLevel = 'manager' | 'auditor' | 'management';

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
}

// Import PeriodSelection type
import { ReviewPeriodSelectorEnhanced, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';

interface UnifiedScorecardProps {
  viewLevel: ScorecardViewLevel;
  employee: EmployeeProfile;
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
  onBack: () => void;
  autoOpenKpiId?: string | null;
}

// Configuration per view level
const VIEW_LEVEL_CONFIG: Record<ScorecardViewLevel, {
  title: string;
  description: string;
  pendingStatus: string;
  reviewableStatuses: string[];
  scoreFieldPrefix: string;
  previousScoreField: 'self_score' | 'manager_score' | 'auditor_score';
  forwardStatus: string;
  sendBackTargets: Array<{ value: string; label: string }>;
  actionLabel: string;
  roleIcon: React.ElementType;
}> = {
  manager: {
    title: 'Manager Review',
    description: 'Review and provide your assessment for this KPI',
    pendingStatus: 'self_review',
    reviewableStatuses: ['self_review'],
    scoreFieldPrefix: 'manager',
    previousScoreField: 'self_score',
    forwardStatus: 'manager_check',
    sendBackTargets: [{ value: 'employee', label: 'Employee' }],
    actionLabel: 'Approve',
    roleIcon: User,
  },
  auditor: {
    title: 'Audit Review',
    description: 'Verify and audit this KPI performance',
    pendingStatus: 'manager_check',
    reviewableStatuses: ['manager_check', 'audit'],
    scoreFieldPrefix: 'auditor',
    previousScoreField: 'manager_score',
    forwardStatus: 'management_review',
    sendBackTargets: [
      { value: 'manager', label: 'Manager' },
      { value: 'employee', label: 'Employee' },
    ],
    actionLabel: 'Forward to Management',
    roleIcon: Shield,
  },
  management: {
    title: 'Management Review',
    description: 'Final review and approval of this KPI',
    pendingStatus: 'management_review',
    reviewableStatuses: ['management_review'],
    scoreFieldPrefix: 'management',
    previousScoreField: 'auditor_score',
    forwardStatus: 'approved',
    sendBackTargets: [
      { value: 'auditor', label: 'Auditor' },
      { value: 'manager', label: 'Manager' },
      { value: 'employee', label: 'Employee' },
    ],
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
  
  const config = VIEW_LEVEL_CONFIG[viewLevel];
  
  // Filter KPIs by period and year
  const kpis = useMemo(() => allKpis?.filter(k => {
    const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
    const yearMatch = k.review_year === selectedYear;
    return periodMatch && yearMatch;
  }), [allKpis, selectedPeriod, selectedYear]);

  // Fetch org KPI values for this period
  const { data: orgKpiValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);

  // Create org KPI values lookup map
  const orgKpiValuesMap = useMemo(() => {
    const map = new Map<string, { achieved_value: number | null; data_source: string | null }>();
    orgKpiValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, { achieved_value: v.achieved_value, data_source: v.data_source });
    });
    return map;
  }, [orgKpiValues]);

  // Helper to get org KPI value based on scope
  const getOrgKpiValue = (kpi: KPI) => {
    if (!kpi.is_org_level) return null;
    const scope = (kpi as any).org_level_scope || 'organization';
    let key: string;
    if (scope === 'organization') {
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    } else if (scope === 'department') {
      const deptId = employee.department_id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${deptId}||null`;
    } else {
      const empId = employee.id || 'null';
      key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||${empId}`;
    }
    return orgKpiValuesMap.get(key) || null;
  };

  // Sorting with default Weightage (High to Low)
  const { sortedKpis, sortConfig, setSort } = useKpiSorting(kpis);

  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);

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
  
  // Review state
  const [reviewerScore, setReviewerScore] = useState<number | null>(null);
  const [reviewerRemarks, setReviewerRemarks] = useState('');
  const [reviewerEvidenceUrl, setReviewerEvidenceUrl] = useState<string | null>(null);
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

  // Org KPI send-back dialog state (for management)
  const [orgKpiSendBackOpen, setOrgKpiSendBackOpen] = useState(false);
  const [selectedOrgKpiForSendBack, setSelectedOrgKpiForSendBack] = useState<KPI | null>(null);

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
  const queryMap = useMemo(() => {
    const map = new Map<string, KpiQuery[]>();
    queries?.forEach(q => {
      const existing = map.get(q.kpi_id) || [];
      map.set(q.kpi_id, [...existing, q]);
    });
    return map;
  }, [queries]);

  // Get the relevant score based on view level (cascade down the chain)
  const getRelevantScore = (submission: any) => {
    if (!submission) return 0;
    // Prefer final_score (set by import or workflow completion)
    if (submission.final_score !== null && submission.final_score !== undefined) {
      return submission.final_score;
    }
    // Fallback to level-specific scores for in-progress reviews
    if (viewLevel === 'manager') {
      return submission.manager_score ?? submission.self_score ?? 0;
    } else if (viewLevel === 'auditor') {
      return submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
    } else {
      return submission.management_score ?? submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? 0;
    }
  };

  // Calculate scores
  const scoreData = useMemo(() => {
    if (!kpis || !submissions) return { overallScore: 0, rating: 0, categoryScores: [], totalWeightedScore: 0, totalWeight: 0 };
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryMap = new Map<string, { 
      totalScore: number; 
      totalWeight: number; 
      color: string | null;
      dynamicWeightage: number;
    }>();
    
    kpis.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      if (submission?.is_na) return;
      
      const score = getRelevantScore(submission);
      const weight = kpi.weightage || 0;
      const categoryName = kpi.kra_categories?.name || 'Other';
      const categoryColor = kpi.kra_categories?.color || null;
      
      const existing = categoryMap.get(categoryName) || { 
        totalScore: 0, 
        totalWeight: 0, 
        color: categoryColor,
        dynamicWeightage: 0
      };
      
      if (weight > 0) {
        existing.dynamicWeightage += weight;
        // Always include non-NA KPIs in both numerator and denominator
        totalWeightedScore += score * weight;
        totalWeight += weight;
        existing.totalScore += score * weight;
        existing.totalWeight += weight;
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
  }, [kpis, submissions, submissionMap, viewLevel]);

  // Submit review mutation
  const submitReview = useMutation({
    mutationFn: async ({
      kpi_id,
      rating,
      score,
      remarks,
      evidence_url,
      achieved_value,
      approve,
    }: {
      kpi_id: string;
      rating: RatingLevel;
      score: number;
      remarks: string;
      evidence_url?: string | null;
      achieved_value?: number | null;
      approve: boolean;
    }) => {
      const updateData: any = {};
      const prefix = config.scoreFieldPrefix;
      
      updateData[`${prefix}_rating`] = rating;
      updateData[`${prefix}_score`] = score;
      updateData[`${prefix}_remarks`] = remarks;
      updateData[`${prefix}_evidence_url`] = evidence_url;
      if (achieved_value !== undefined) {
        updateData[`${prefix}_achieved_value`] = achieved_value;
      }
      
      // For management, set final score
      if (viewLevel === 'management') {
        updateData.final_rating = rating;
        updateData.final_score = score;
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

      const newStatus = approve ? config.forwardStatus : config.pendingStatus;
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
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ 
        title: variables.approve 
          ? `${viewLevel === 'management' ? 'Approved' : 'Forwarded'} successfully`
          : 'Review saved'
      });
      setReviewSheetOpen(false);
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
      const statusMap: Record<string, string> = {
        auditor: 'audit',
        manager: viewLevel === 'auditor' ? 'self_review' : 'manager_check',
        employee: 'kra_set',
      };

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: statusMap[target] as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // Clear reviewer fields
      const updateData: any = {};
      const prefix = config.scoreFieldPrefix;
      updateData[`${prefix}_rating`] = null;
      updateData[`${prefix}_score`] = null;
      updateData[`${prefix}_remarks`] = null;

      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update(updateData)
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI sent back successfully' });
      setSendBackDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back', description: error.message, variant: 'destructive' });
    },
  });

  // Open review sheet
  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    
    // Get the appropriate previous score based on view level
    let prevScore = null;
    if (viewLevel === 'manager') {
      prevScore = existing?.manager_score || null;
    } else if (viewLevel === 'auditor') {
      prevScore = existing?.auditor_score || existing?.manager_score || null;
    } else {
      prevScore = existing?.management_score || existing?.auditor_score || null;
    }
    
    setReviewerScore(prevScore);
    setReviewerRemarks((existing as any)?.[`${config.scoreFieldPrefix}_remarks`] || '');
    setReviewerEvidenceUrl((existing as any)?.[`${config.scoreFieldPrefix}_evidence_url`] || null);
    setReviewerAchievedValue(
      (existing as any)?.[`${config.scoreFieldPrefix}_achieved_value`] || 
      existing?.achieved_value || 
      null
    );
    
    // Reset state
    setReviewerAgrees(null);
    setDailyOverrides(new Map());
    setOverrideReason('');
    setNaConfirmed(false);
    setNaRemarks('');
    setReviewSheetOpen(true);
  };

  // Handle submit review
  const handleSubmitReview = async (approve: boolean) => {
    if (!selectedKpi) return;
    
    const submission = submissionMap.get(selectedKpi.id);
    const isNaKpi = submission?.is_na || false;
    
    // For N/A KPIs
    if (isNaKpi) {
      if (!naConfirmed) return;
      
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: `${viewLevel.toUpperCase()}_NA_CONFIRMED`,
          performed_by: user.id,
          new_value: { na_remarks: naRemarks },
          metadata: { confirmed_at: new Date().toISOString() },
        });
      }
      
      const newStatus = approve ? config.forwardStatus : config.pendingStatus;
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', selectedKpi.id);
      
      if (kpiError) {
        toast({ title: 'Failed to process N/A KPI', description: kpiError.message, variant: 'destructive' });
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: approve ? 'N/A KPI approved' : 'N/A KPI confirmed' });
      setReviewSheetOpen(false);
      return;
    }
    
    // Regular KPI flow
    if (reviewerScore === null) return;
    
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
            review_level: viewLevel,
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
            review_level: viewLevel,
            review_month: selectedPeriod,
            review_year: selectedYear,
          });
        }
      }
    }
    
    const rating = scoreToRating(reviewerScore);
    submitReview.mutate({
      kpi_id: selectedKpi.id,
      rating,
      score: reviewerScore,
      remarks: reviewerRemarks,
      evidence_url: reviewerEvidenceUrl,
      achieved_value: typeof reviewerAchievedValue === 'number' 
        ? reviewerAchievedValue 
        : reviewerAchievedValue ? parseFloat(reviewerAchievedValue) : null,
      approve,
    });
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

  // Handle raise query (manager only)
  const handleRaiseQuery = () => {
    if (!selectedKpi || !queryReason.trim()) return;
    raiseQuery.mutate({
      kpi_id: selectedKpi.id,
      raised_to: employee.id,
      reason: queryReason,
      entity_type: 'kpi',
    }, {
      onSuccess: () => setQueryDialogOpen(false),
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
  const viewType = viewLevel === 'manager' ? 'team-review' : viewLevel === 'auditor' ? 'audit' : 'management';

  // Check if KPI is reviewable at current level
  const isReviewable = (kpi: KPI) => config.reviewableStatuses.includes(kpi.status || '');

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  const RoleIcon = config.roleIcon;

  return (
    <div className="space-y-6">
      {/* 1. Profile + Filters Row - Matches Dashboard Layout */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Profile Card - Left with Back Button */}
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
            </p>
          </div>
        </div>

        {/* Filters - Right (matching Dashboard with Cumulative Mode) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 flex-shrink-0">
          <ReviewPeriodSelectorEnhanced
            value={periodSelection}
            onChange={onPeriodSelectionChange}
          />
          
          <div className="h-6 w-px bg-border hidden sm:block" />
          
          <Badge variant="outline" className="text-xs h-6 px-2 whitespace-nowrap">
            {kpis?.length || 0} KPIs
          </Badge>
        </div>
      </div>

      {/* 2. Performance Charts Row - 1:5 ratio matching Dashboard */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-6">
        {/* Overall Score Chart - Small (1/6) */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overall</CardTitle>
            <CardDescription className="text-xs">Performance</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
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
          </CardContent>
        </Card>

        {/* Category Breakdown - Wide (5/6) */}
        <Card className="md:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Category</CardTitle>
            <CardDescription className="text-xs">Score breakdown across KRA categories</CardDescription>
          </CardHeader>
          <CardContent style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}>
            <CategoryScoreChart data={scoreData.categoryScores} />
          </CardContent>
        </Card>
      </div>

      {/* 3. Status Progress - Full Width Workflow Tracker (not compact) */}
      <WorkflowProgressTracker kpis={kpis || []} queries={queries || []} />


      {/* 4. KPI Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <CardTitle>KPI Details</CardTitle>
              <CardDescription>Click on a KPI to review and update scores</CardDescription>
            </div>
            {!isMobile && <KpiSortControl sortConfig={sortConfig} onSortChange={setSort} />}
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isMobile ? (
            <div className="space-y-3">
              {sortedKpis.map(kpi => {
                const submission = submissionMap.get(kpi.id);
                return (
                  <MobileKpiCard
                    key={kpi.id}
                    kpi={kpi}
                    submission={submission}
                    viewType={viewType}
                    onAction={openReviewSheet}
                    onView={openReviewSheet}
                    onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
                    onSendBack={openSendBackDialog}
                    onToggleExpand={toggleDailyExpand}
                    isExpanded={expandedDailyKpis.has(kpi.id)}
                    getOrgKpiValue={getOrgKpiValue}
                  />
                );
              })}
              {sortedKpis.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No KPIs found for this period
                </p>
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
              onReview={openReviewSheet}
              onView={openReviewSheet}
              onSendBack={openSendBackDialog}
              onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
              expandedKpis={expandedDailyKpis}
              onToggleExpand={toggleDailyExpand}
            />
          )}
        </CardContent>
      </Card>

      {/* Review Sheet */}
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
                allSubmissions={submissions || []}
                queries={queryMap.get(selectedKpi.id) || []}
                viewLevel={viewLevel}
                currentUserId={user?.id}
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onOpenQueryHistory={() => setHistoryDialogOpen(true)}
                onOpenFullHistory={() => setTrackerModalOpen(true)}
                onOpenTimeline={() => setTimelineOpen(true)}
              />
              
              {/* N/A Confirmation Card */}
              {submissionMap.get(selectedKpi.id)?.is_na && isReviewable(selectedKpi) && (
                <NaConfirmationCard
                  selfRemarks={submissionMap.get(selectedKpi.id)?.self_remarks || null}
                  confirmed={naConfirmed}
                  onConfirmChange={setNaConfirmed}
                  remarks={naRemarks}
                  onRemarksChange={setNaRemarks}
                  reviewerLevel={viewLevel === 'manager' ? 'Manager' : viewLevel === 'auditor' ? 'Auditor' : 'Management'}
                />
              )}
              
              {/* Daily Submission Summary + Override */}
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

              {/* Score Input - Only for reviewable KPIs and non-daily-binary */}
              {isReviewable(selectedKpi) && !(selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary') && (
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

                  {/* Remarks */}
                  <div className="space-y-2">
                    <Label>{viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1)} Remarks</Label>
                    <Textarea
                      value={reviewerRemarks}
                      onChange={(e) => setReviewerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {/* Evidence Upload */}
                  {user?.id && (
                    <EvidenceUpload
                      userId={user.id}
                      kpiId={selectedKpi.id}
                      onUploadComplete={setReviewerEvidenceUrl}
                      existingUrl={reviewerEvidenceUrl}
                    />
                  )}
                </>
              )}
              
              {/* Remarks for Daily Binary */}
              {isReviewable(selectedKpi) && selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary' && reviewerAgrees !== null && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{viewLevel.charAt(0).toUpperCase() + viewLevel.slice(1)} Remarks</Label>
                    <Textarea
                      value={reviewerRemarks}
                      onChange={(e) => setReviewerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {user?.id && (
                    <EvidenceUpload
                      userId={user.id}
                      kpiId={selectedKpi.id}
                      onUploadComplete={setReviewerEvidenceUrl}
                      existingUrl={reviewerEvidenceUrl}
                    />
                  )}
                </div>
              )}
            </div>
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
                  {viewLevel === 'manager' && (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                      onClick={() => {
                        if (selectedKpi) {
                          setQueryReason('');
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
                  {!submissionMap.get(selectedKpi?.id || '')?.is_na && (
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
                      submissionMap.get(selectedKpi?.id || '')?.is_na ? !naConfirmed :
                      (reviewerScore === null || 
                       submitReview.isPending || 
                       isSavingOverrides ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && reviewerAgrees === null) ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && reviewerAgrees === false && !overrideReason.trim()))
                    }
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {submissionMap.get(selectedKpi?.id || '')?.is_na 
                      ? 'Confirm N/A' 
                      : isSavingOverrides ? 'Saving...' : submitReview.isPending ? 'Processing...' : config.actionLabel}
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReviewSheetOpen(false)}>
                Close
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Query Dialog (Manager only) */}
      {viewLevel === 'manager' && (
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
        submissions={submissions || []}
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
  config: typeof VIEW_LEVEL_CONFIG[ScorecardViewLevel];
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
  
  const getScoreLabel = (score: number | null): string => {
    if (score === null) return 'Not Set';
    switch (score) {
      case 5: return 'Outstanding';
      case 4: return 'Exceeds Expectations';
      case 3: return 'Meets Expectations';
      case 2: return 'Below Expectations';
      case 1: return 'Needs Improvement';
      case 0: return 'Not Achieved';
      default: return 'Unknown';
    }
  };
  
  const getScoreBadgeClass = (score: number | null): string => {
    if (score === null) return 'bg-muted text-muted-foreground';
    if (score >= 4) return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
    if (score >= 3) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
    if (score >= 2) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
  };
  
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
                reviewLevel={viewLevel}
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
  );
}

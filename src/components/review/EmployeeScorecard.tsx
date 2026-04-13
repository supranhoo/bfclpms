import React, { useState, useMemo } from 'react';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { resolveForwardStatus, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';
import { useRemarksMandatorySettings } from '@/hooks/useWorkflowSettings';
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
import { useObservationsByKpis } from '@/hooks/useKpiObservations';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useOrgKpiDataOwnerNames, getOwnerNamesForKpi } from '@/hooks/useOrgKpiDataOwner';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { ManagerDailyOverrideEditor, calculateOverriddenScore } from '@/components/review/ManagerDailyOverrideEditor';
import { useManagerSubPeriodOverride } from '@/hooks/useManagerSubPeriodOverride';
import { QualitativeOption } from '@/lib/qualitativeUom';
import { useAuth } from '@/contexts/AuthContext';
import { useKpiSorting } from '@/hooks/useKpiSorting';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart, type CategorySortBy } from '@/components/dashboard/CategoryScoreChart';
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
import { scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Lock, MessageSquare, Undo2, Check, Eye, Calendar, ChevronDown, ChevronUp, History, Edit2, Send
} from 'lucide-react';
import { 
  kpiStatusColors, 
  kpiStatusLabels,
  getScoreBadgeClass,
  getScoreLabel,
} from '@/lib/reviewConstants';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { NaConfirmationCard } from '@/components/review/NaConfirmationCard';

interface EmployeeScorecardProps {
  employee: {
    id: string;
    full_name: string | null;
    email: string;
    designation: string | null;
    employee_code: string | null;
    avatar_url: string | null;
    department_id: string | null;
  };
  selectedPeriod: string;
  selectedYear: number;
  onPeriodChange: (period: string) => void;
  onYearChange: (year: number) => void;
  onBack: () => void;
  autoOpenKpiId?: string | null;
}

export function EmployeeScorecard({ 
  employee, 
  selectedPeriod, 
  selectedYear, 
  onPeriodChange,
  onYearChange,
  onBack,
  autoOpenKpiId 
}: EmployeeScorecardProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useKpisByEmployee(employee.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const remarksMandatory = useRemarksMandatorySettings();
  
  // Fetch workflow stages for this employee
  const { data: workflowStages } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const managerForwardStatus = resolveForwardStatus('manager', effectiveStages);

  // Governance permissions for this period
  const govPerms = useReviewPeriodPermissions(selectedPeriod, selectedYear);
  const isGovernanceLocked = !govPerms.submit_manager_review || govPerms.view_only;
  
  // Filter KPIs by period and year
  const kpis = useMemo(() => allKpis?.filter(k => {
    const periodMatch = k.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
    const yearMatch = k.review_year === selectedYear;
    return periodMatch && yearMatch;
  }), [allKpis, selectedPeriod, selectedYear]);

  // Fetch org KPI values for this period
  const { data: orgKpiValues } = useOrgKpiValues(undefined, selectedPeriod, selectedYear);
  const { data: dataOwnerNamesMap } = useOrgKpiDataOwnerNames();

  // Create org KPI values lookup map
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

  const submissionMap = useMemo(() => new Map(submissions?.map(s => [s.kpi_id, s])), [submissions]);

  // Status filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Sorting with default Weightage (High to Low)
  const { sortedKpis: rawSortedKpis, sortConfig, setSort } = useKpiSorting(kpis, {}, submissionMap);
  const sortedKpis = statusFilter ? rawSortedKpis.filter(k => k.status === statusFilter) : rawSortedKpis;

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
  
  const [managerScore, setManagerScore] = useState<number | null>(null);
  const [managerRemarks, setManagerRemarks] = useState('');
  const [managerEvidenceUrls, setManagerEvidenceUrls] = useState<string[]>([]);
  const [managerAchievedValue, setManagerAchievedValue] = useState<number | string | null>(null);
  const [queryReason, setQueryReason] = useState('');
  const [sendBackReason, setSendBackReason] = useState('');
  
  // Manager daily override state
  const [managerAgrees, setManagerAgrees] = useState<boolean | null>(null);
  const [dailyOverrides, setDailyOverrides] = useState<Map<string, number>>(new Map());
  const [overrideReason, setOverrideReason] = useState('');
  
  // N/A confirmation state
  const [naConfirmed, setNaConfirmed] = useState(false);
  const [naRemarks, setNaRemarks] = useState('');
  
  // Reviewer-initiated N/A state
  const [reviewerMarkNa, setReviewerMarkNa] = useState(false);
  const [markNaRemarks, setMarkNaRemarks] = useState('');
  
  // N/A override state
  const [naOverridden, setNaOverridden] = useState(false);
  const [overrideNaRemarks, setOverrideNaRemarks] = useState('');

  const approveKpi = useApproveKpi();
  const raiseQuery = useRaiseQuery();
  const sendBackKpi = useSendBackKpi();
  const { saveOverrides, acceptEmployeeValues, isLoading: isSavingOverrides } = useManagerSubPeriodOverride();
  const queryMap = new Map<string, typeof queries>();
  queries?.forEach(q => {
    const existing = queryMap.get(q.kpi_id) || [];
    queryMap.set(q.kpi_id, [...existing, q]);
  });

  // Filtered KPIs for charts based on status filter
  const displayKpis = useMemo(() => {
    if (!kpis) return [];
    return statusFilter ? kpis.filter(k => k.status === statusFilter) : kpis;
  }, [kpis, statusFilter]);

  // Calculate scores - include ALL categories with KPIs (even without scores)
  const scoreData = useMemo(() => {
    if (!displayKpis.length || !submissions) return { overallScore: 0, rating: 0, categoryScores: [] };
    
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
      if (!submission || submission.is_na) return; // Skip unsubmitted & NA KPIs
      
      const score = submission?.manager_score ?? submission?.self_score ?? 0;
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
        if (score > 0) {
          totalWeightedScore += score * weight;
          totalWeight += weight;
          existing.totalScore += score * weight;
        }
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
    
    return { overallScore, rating: overallRating, categoryScores };
  }, [displayKpis, submissions, submissionMap]);

  // Stats
  const pendingReviewCount = kpis?.filter(k => k.status === 'self_review').length || 0;
  const reviewedCount = kpis?.filter(k => ['manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'].includes(k.status || '')).length || 0;
  const totalKpis = kpis?.length || 0;

  const submitManagerReview = useMutation({
    mutationFn: async ({
      kpi_id,
      manager_rating,
      manager_score,
      manager_remarks,
      manager_evidence_url,
    }: {
      kpi_id: string;
      manager_rating: RatingLevel;
      manager_score: number;
      manager_remarks: string;
      manager_evidence_url?: string | null;
    }) => {
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          manager_rating,
          manager_score,
          manager_remarks,
          manager_evidence_url,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: managerForwardStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Manager review submitted' });
      setReviewSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setManagerScore(existing?.manager_score ?? null);
    setManagerRemarks(existing?.manager_remarks || '');
    // Support both new array and legacy single URL
    const existingUrls = (existing as any)?.manager_evidence_urls;
    setManagerEvidenceUrls(Array.isArray(existingUrls) && existingUrls.length > 0 
      ? existingUrls 
      : existing?.manager_evidence_url ? [existing.manager_evidence_url] : []);
    setManagerAchievedValue((existing as any)?.manager_achieved_value ?? existing?.achieved_value ?? null);
    // Reset manager override state
    setManagerAgrees(null);
    setDailyOverrides(new Map());
    setOverrideReason('');
    // Reset N/A confirmation state
    setNaConfirmed(false);
    setNaRemarks('');
    setReviewerMarkNa(false);
    setMarkNaRemarks('');
    setNaOverridden(false);
    setOverrideNaRemarks('');
    setReviewSheetOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedKpi || managerScore === null) return;

    // Validate mandatory remarks for manager review
    if (remarksMandatory.manager && !managerRemarks.trim()) {
      toast({ title: 'Remarks Required', description: 'Remarks are required for Manager review', variant: 'destructive' });
      return;
    }

    const rating = scoreToRating(managerScore);
    submitManagerReview.mutate({
      kpi_id: selectedKpi.id,
      manager_rating: rating,
      manager_score: managerScore,
      manager_remarks: managerRemarks,
      manager_evidence_url: managerEvidenceUrls.length > 0 ? managerEvidenceUrls[0] : null,
    });
  };

  const handleApprove = async () => {
    if (!selectedKpi) return;
    
    const submission = submissionMap.get(selectedKpi.id);
    const isNaKpi = submission?.is_na || false;
    
    // Reviewer-initiated N/A marking
    if (reviewerMarkNa && !isNaKpi) {
      if (!markNaRemarks.trim()) return;
      
      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          is_na: true,
          na_marked_by_role: 'manager',
          manager_remarks: markNaRemarks,
        })
        .eq('kpi_id', selectedKpi.id);
      
      if (submissionError) {
        toast({ title: 'Failed to mark N/A', description: submissionError.message, variant: 'destructive' });
        return;
      }
      
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: managerForwardStatus as any })
        .eq('id', selectedKpi.id);
      
      if (kpiError) {
        toast({ title: 'Failed to update status', description: kpiError.message, variant: 'destructive' });
        return;
      }
      
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: 'MANAGER_MARKED_NA',
          performed_by: user.id,
          new_value: { na_remarks: markNaRemarks, na_marked_by_role: 'manager' },
          metadata: { marked_at: new Date().toISOString() },
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'KPI marked as N/A and forwarded' });
      setReviewSheetOpen(false);
      return;
    }
    
    // For existing N/A KPIs — override or confirm
    if (isNaKpi) {
      // N/A Override: manager decides KPI IS applicable
      if (naOverridden) {
        if (!overrideNaRemarks.trim()) return;
        if (managerScore === null) return;
        
        const rating = scoreToRating(managerScore);
        const { error: submissionError } = await supabase
          .from('review_submissions')
          .update({
            is_na: false,
            na_marked_by_role: null,
            manager_rating: rating,
            manager_score: managerScore,
            manager_remarks: overrideNaRemarks,
            manager_evidence_url: managerEvidenceUrls.length > 0 ? managerEvidenceUrls[0] : null,
          })
          .eq('kpi_id', selectedKpi.id);
        
        if (submissionError) {
          toast({ title: 'Failed to override N/A', description: submissionError.message, variant: 'destructive' });
          return;
        }
        
        const { error: kpiError } = await supabase
          .from('kpis')
          .update({ status: managerForwardStatus as any })
          .eq('id', selectedKpi.id);
        
        if (kpiError) {
          toast({ title: 'Failed to update status', description: kpiError.message, variant: 'destructive' });
          return;
        }
        
        if (user?.id) {
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: selectedKpi.id,
            action: 'MANAGER_NA_OVERRIDDEN',
            performed_by: user.id,
            new_value: { override_remarks: overrideNaRemarks, score: managerScore },
            metadata: { overridden_at: new Date().toISOString() },
          });
        }
        
        queryClient.invalidateQueries({ queryKey: ['kpis'] });
        queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
        toast({ title: 'N/A overridden — KPI scored and approved' });
        setReviewSheetOpen(false);
        return;
      }
      
      // N/A Confirmation (original)
      if (!naConfirmed) return;
      
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: 'MANAGER_NA_CONFIRMED',
          performed_by: user.id,
          new_value: { na_remarks: naRemarks },
          metadata: { confirmed_at: new Date().toISOString() },
        });

        // Persist N/A remarks to review_submissions so Review Journey tiles show them
        if (naRemarks.trim()) {
          await supabase.from('review_submissions')
            .update({ manager_remarks: naRemarks } as any)
            .eq('kpi_id', selectedKpi.id);
        }
      }
      
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: managerForwardStatus as any })
        .eq('id', selectedKpi.id);
      
      if (kpiError) {
        toast({ title: 'Failed to approve N/A KPI', description: kpiError.message, variant: 'destructive' });
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'N/A KPI confirmed and approved' });
      setReviewSheetOpen(false);
      return;
    }
    
    // Regular KPI approval flow
    if (managerScore === null) return;
    
    const isDailyBinary = selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary';
    
    // For daily binary KPIs, handle manager value persistence
    if (isDailyBinary) {
      if (managerAgrees === false && dailyOverrides.size > 0) {
        // Manager disagrees and has overrides - save them
        const overrideEntries = Array.from(dailyOverrides.entries()).map(([date, value]) => ({
          sub_period_value: date,
          achieved_value: value,
          original_value: null,
        }));
        
        const originalScore = submission?.self_score ?? null;
        
        await saveOverrides.mutateAsync({
          kpi_id: selectedKpi.id,
          employee_id: employee.id,
          overrides: overrideEntries,
          reason: overrideReason,
          review_month: selectedPeriod,
          review_year: selectedYear,
          original_score: originalScore,
          new_score: managerScore,
        });
      } else {
        // Manager agrees - copy all employee values to manager_achieved_value column
        await acceptEmployeeValues.mutateAsync({
          kpi_id: selectedKpi.id,
          review_month: selectedPeriod,
          review_year: selectedYear,
        });
      }
    }
    
    const rating = scoreToRating(managerScore);
    approveKpi.mutate({
      kpi_id: selectedKpi.id,
      manager_rating: rating,
      manager_score: managerScore,
      manager_remarks: managerRemarks,
      manager_evidence_url: managerEvidenceUrls.length > 0 ? managerEvidenceUrls[0] : null,
      manager_achieved_value: typeof managerAchievedValue === 'number' 
        ? managerAchievedValue 
        : managerAchievedValue ? parseFloat(managerAchievedValue) : null,
      forwardStatus: managerForwardStatus,
    }, {
      onSuccess: () => setReviewSheetOpen(false),
    });
  };

  const [queryEvidenceUrl, setQueryEvidenceUrl] = useState('');
  const openQueryDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setQueryReason('');
    setQueryEvidenceUrl('');
    setQueryDialogOpen(true);
  };

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

  const openSendBackDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackDialogOpen(true);
  };

  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBackKpi.mutate({
      kpi_id: selectedKpi.id,
      employee_id: employee.id,
      reason: sendBackReason,
    }, {
      onSuccess: () => setSendBackDialogOpen(false),
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

  if (isLoading) {
    return <ReviewPanelSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 shrink-0">
            <AvatarImage src={employee.avatar_url || undefined} />
            <AvatarFallback>{getInitials(employee.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold truncate">{employee.full_name || employee.email}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {employee.designation || 'Employee'} {employee.employee_code ? `• ${employee.employee_code}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 self-start sm:self-auto">
          <Select value={selectedPeriod} onValueChange={onPeriodChange}>
            <SelectTrigger className="h-8 w-[100px] sm:w-[130px] text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                <SelectItem key={month} value={month}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
            <SelectTrigger className="h-8 w-[70px] sm:w-[80px] text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Workflow Progress Tracker */}
      <WorkflowProgressTracker kpis={kpis || []} queries={queries || []} compact workflowStages={effectiveStages} activeFilter={statusFilter} onFilterChange={setStatusFilter} />

      {/* Score Overview */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
        {/* Overall Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[140px] sm:h-[180px]">
              <OverallScoreChart percentage={scoreData.overallScore} rating={scoreData.rating} />
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Category Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}>
              <CategoryScoreChart data={scoreData.categoryScores} sortBy={categorySortBy} onSortChange={setCategorySortBy} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Row */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Total KPIs</p>
                <p className="text-lg sm:text-2xl font-bold">{totalKpis}</p>
              </div>
              <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Pending</p>
                <p className="text-lg sm:text-2xl font-bold text-yellow-600">{pendingReviewCount}</p>
              </div>
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Reviewed</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">{reviewedCount}</p>
              </div>
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Progress</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-600">
                  {totalKpis > 0 ? Math.round((reviewedCount / totalKpis) * 100) : 0}%
                </p>
              </div>
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
                <div 
                  className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-500" 
                  style={{ transform: `scale(${reviewedCount / totalKpis || 0})` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Table */}
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
                    viewType="team-review"
                    onAction={openReviewSheet}
                    onView={openReviewSheet}
                    onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
                    onSendBack={openSendBackDialog}
                    onToggleExpand={toggleDailyExpand}
                    isExpanded={expandedDailyKpis.has(kpi.id)}
                    getOrgKpiValue={getOrgKpiValue}
                    observationCount={observationCounts.get(kpi.id) || 0}
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
              viewType="team-review"
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onReview={openReviewSheet}
              onView={openReviewSheet}
              onSendBack={openSendBackDialog}
              onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
              expandedKpis={expandedDailyKpis}
              onToggleExpand={toggleDailyExpand}
              workflowStages={effectiveStages}
              dataOwnerNames={dataOwnerNamesMap}
              observationCounts={observationCounts}
            />
          )}
        </CardContent>
      </Card>

      {/* Review Sheet */}
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="pb-2 sm:pb-4">
            <SheetTitle className="text-base sm:text-lg">
              {selectedKpi?.status === 'self_review' ? 'Manager Review' : 'View KPI Details'}
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">
              {selectedKpi?.status === 'self_review' 
                ? 'Review and provide your assessment for this KPI'
                : 'View daily submission details for this KPI'}
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
                viewLevel="manager"
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
              
              {/* N/A Confirmation Card - Show when KPI is marked as N/A (with override option) */}
              {submissionMap.get(selectedKpi.id)?.is_na && selectedKpi.status === 'self_review' && (
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
                  reviewerLevel="Manager"
                  naMarkedByRole={(submissionMap.get(selectedKpi.id) as any)?.na_marked_by_role || null}
                  naOverridden={naOverridden}
                  onOverrideNa={setNaOverridden}
                  overrideRemarks={overrideNaRemarks}
                  onOverrideRemarksChange={setOverrideNaRemarks}
                />
              )}
              
              {/* Reviewer-initiated Mark as N/A */}
              {!submissionMap.get(selectedKpi.id)?.is_na && selectedKpi.status === 'self_review' && (
                <NaConfirmationCard
                  selfRemarks={null}
                  confirmed={false}
                  onConfirmChange={() => {}}
                  remarks=""
                  onRemarksChange={() => {}}
                  reviewerLevel="Manager"
                  canMarkNa
                  reviewerMarkedNa={reviewerMarkNa}
                  onReviewerMarkNa={setReviewerMarkNa}
                  markNaRemarks={markNaRemarks}
                  onMarkNaRemarksChange={setMarkNaRemarks}
                />
              )}
              {/* Daily Submission Summary + Manager Override - hidden when reviewer marks N/A */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && (
                <DailySubmissionSummaryWithOverride 
                  kpi={selectedKpi} 
                  selectedPeriod={selectedPeriod} 
                  selectedYear={selectedYear}
                  isReviewMode={selectedKpi.status === 'self_review'}
                  managerAgrees={managerAgrees}
                  onManagerAgreesChange={setManagerAgrees}
                  dailyOverrides={dailyOverrides}
                  onDailyOverridesChange={setDailyOverrides}
                  overrideReason={overrideReason}
                  onOverrideReasonChange={setOverrideReason}
                  managerScore={managerScore}
                  onManagerScoreChange={setManagerScore}
                  submissionMap={submissionMap}
                />
              )}

              {/* Score Input - hidden when reviewer marks N/A */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && selectedKpi.status === 'self_review' && !(selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary') && (
                <>
                  <AchievedValueScoreInput
                    kpi={selectedKpi}
                    achievedValue={managerAchievedValue}
                    score={managerScore}
                    onAchievedValueChange={setManagerAchievedValue}
                    onScoreChange={(score, _rating) => setManagerScore(score)}
                    label="Manager Score"
                    reviewMonth={selectedPeriod}
                    reviewYear={selectedYear}
                  />

                  {/* Remarks */}
                  <div className="space-y-2">
                    <Label>Manager Remarks{remarksMandatory.manager && <span className="text-destructive ml-1">*</span>}</Label>
                    <Textarea
                      value={managerRemarks}
                      onChange={(e) => setManagerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {/* Evidence Upload */}
                  {user?.id && (
                    <MultiFileUpload
                      userId={user.id}
                      contextId={selectedKpi.id}
                      folder="manager-evidence"
                      existingUrls={managerEvidenceUrls}
                      onUploadComplete={setManagerEvidenceUrls}
                      label="Manager Evidence"
                    />
                  )}
                </>
              )}
              
              {/* Remarks for Daily Binary (shown separately after agreement toggle) */}
              {!reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && selectedKpi.status === 'self_review' && selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary' && managerAgrees !== null && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Manager Remarks{remarksMandatory.manager && <span className="text-destructive ml-1">*</span>}</Label>
                    <Textarea
                      value={managerRemarks}
                      onChange={(e) => setManagerRemarks(e.target.value)}
                      placeholder="Enter your assessment and feedback..."
                      rows={3}
                    />
                  </div>

                  {/* Evidence Upload */}
                  {user?.id && (
                    <MultiFileUpload
                      userId={user.id}
                      contextId={selectedKpi.id}
                      folder="manager-evidence"
                      existingUrls={managerEvidenceUrls}
                      onUploadComplete={setManagerEvidenceUrls}
                      label="Manager Evidence"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <SheetFooter className="flex-col sm:flex-row gap-2 sm:justify-between mt-4 pb-4">
            {selectedKpi?.status === 'self_review' ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReviewSheetOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                    onClick={() => {
                      if (selectedKpi) {
                        openSendBackDialog(selectedKpi);
                      }
                    }}
                  >
                    <Undo2 className="h-4 w-4 mr-2" />
                    Send Back
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                    onClick={() => {
                      if (selectedKpi) {
                        openQueryDialog(selectedKpi);
                      }
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Raise Query
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  {(!submissionMap.get(selectedKpi?.id || '')?.is_na || naOverridden) && !reviewerMarkNa && (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={handleSubmitReview}
                      disabled={isGovernanceLocked || managerScore === null || submitManagerReview.isPending}
                    >
                      {submitManagerReview.isPending ? 'Saving...' : 'Save Draft'}
                    </Button>
                  )}
                  <Button
                    variant="default"
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                    onClick={handleApprove}
                    disabled={
                      isGovernanceLocked ||
                      (reviewerMarkNa ? !markNaRemarks.trim() :
                      (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden) ? (!overrideNaRemarks.trim() || managerScore === null) :
                      submissionMap.get(selectedKpi?.id || '')?.is_na ? !naConfirmed :
                      (managerScore === null || 
                       approveKpi.isPending || 
                       isSavingOverrides ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && managerAgrees === null) ||
                       (selectedKpi?.frequency === 'Daily' && selectedKpi?.uom_type === 'binary' && managerAgrees === false && !overrideReason.trim())))
                    }
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {reviewerMarkNa 
                      ? 'Mark N/A & Approve'
                      : (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden)
                        ? 'Override N/A & Approve'
                        : submissionMap.get(selectedKpi?.id || '')?.is_na 
                          ? 'Confirm N/A' 
                          : isSavingOverrides ? 'Saving...' : approveKpi.isPending ? 'Approving...' : 'Approve'}
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

      {/* Query Dialog */}
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

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back KPI</DialogTitle>
            <DialogDescription>
              Return this KPI to the employee for revision
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              disabled={!sendBackReason.trim() || sendBackKpi.isPending}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              {sendBackKpi.isPending ? 'Sending...' : 'Send Back'}
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
    </div>
  );
}

// Helper wrapper that fetches sub-period submissions for Daily KPIs with manager override support
function DailySubmissionSummaryWithOverride({ 
  kpi, 
  selectedPeriod, 
  selectedYear,
  isReviewMode,
  managerAgrees,
  onManagerAgreesChange,
  dailyOverrides,
  onDailyOverridesChange,
  overrideReason,
  onOverrideReasonChange,
  managerScore,
  onManagerScoreChange,
  submissionMap,
}: { 
  kpi: KPI; 
  selectedPeriod: string; 
  selectedYear: number;
  isReviewMode: boolean;
  managerAgrees: boolean | null;
  onManagerAgreesChange: (agrees: boolean | null) => void;
  dailyOverrides: Map<string, number>;
  onDailyOverridesChange: (overrides: Map<string, number>) => void;
  overrideReason: string;
  onOverrideReasonChange: (reason: string) => void;
  managerScore: number | null;
  onManagerScoreChange: (score: number | null) => void;
  submissionMap: Map<string, any>;
}) {
  const { data: submissions } = useSubPeriodSubmissions(
    kpi.frequency === 'Daily' ? kpi.id : undefined, 
    selectedPeriod, 
    selectedYear
  );
  
  const isDailyBinary = kpi.frequency === 'Daily' && kpi.uom_type === 'binary';
  const existingSubmission = submissionMap.get(kpi.id);
  const employeeSelfScore = existingSubmission?.self_score ?? null;
  
  // Calculate score when manager agrees = true (use employee's score)
  // or when manager disagrees (recalculate from overrides)
  React.useEffect(() => {
    if (!isDailyBinary || !isReviewMode) return;
    
    if (managerAgrees === true) {
      // Manager accepts employee's score
      onManagerScoreChange(employeeSelfScore);
    } else if (managerAgrees === false && submissions) {
      // Manager disagrees - recalculate with overrides
      const result = calculateOverriddenScore(submissions, dailyOverrides, selectedPeriod, selectedYear);
      onManagerScoreChange(result.score);
    }
  }, [managerAgrees, dailyOverrides, submissions, employeeSelfScore, isDailyBinary, isReviewMode, selectedPeriod, selectedYear, onManagerScoreChange]);
  
  // If not a daily KPI, return nothing
  if (kpi.frequency !== 'Daily' || !submissions || submissions.length === 0) {
    return null;
  }
  
  // getScoreLabel and getScoreBadgeClass imported from reviewConstants
  
  return (
    <div className="space-y-4">
      {/* Daily Submission Summary (read-only) */}
      <DailySubmissionSummary
        kpiId={kpi.id}
        kpiName={kpi.kpi_name}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        submissions={submissions}
        uom={kpi.uom}
        uomType={kpi.uom_type}
        qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
        kpiStatus={kpi.status}
      />
      
      {/* Manager Agreement Toggle - Only for Daily Binary in Review Mode */}
      {isDailyBinary && isReviewMode && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Do you agree with the employee's daily submissions?</Label>
            <div className="flex gap-2">
              <Button
                variant={managerAgrees === true ? 'default' : 'outline'}
                onClick={() => onManagerAgreesChange(true)}
                className={managerAgrees === true ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              >
                <Check className="h-4 w-4 mr-2" />
                Yes - Accept Score
              </Button>
              <Button
                variant={managerAgrees === false ? 'default' : 'outline'}
                onClick={() => onManagerAgreesChange(false)}
                className={managerAgrees === false ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                No - Override Entries
              </Button>
            </div>
          </div>
          
          {/* Override Editor - shown when manager disagrees */}
          {managerAgrees === false && (
            <ManagerDailyOverrideEditor
              kpiId={kpi.id}
              reviewMonth={selectedPeriod}
              reviewYear={selectedYear}
              submissions={submissions}
              overrides={dailyOverrides}
              onOverridesChange={onDailyOverridesChange}
              overrideReason={overrideReason}
              onReasonChange={onOverrideReasonChange}
              originalScore={employeeSelfScore}
            />
          )}
          
          {/* Score Display - shown when manager has made a selection */}
          {managerAgrees !== null && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {managerAgrees === false ? 'Recalculated Manager Score' : 'Manager Score (Accepted)'}
                </span>
                <Badge className={getScoreBadgeClass(managerScore)}>
                  {managerScore ?? '—'} - {getScoreLabel(managerScore)}
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useMemo } from 'react';
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
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { resolveForwardStatus, resolveSendBackTargets, resolveSendBackStatus, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { useKpisByEmployee, useReviewSubmissions, useKpiQueries, RatingLevel, KPI, KpiQuery } from '@/hooks/useKpis';
import { useSubPeriodSubmissions, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useObservationsByKpis } from '@/hooks/useKpiObservations';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { useOrgKpiDataOwnerNames, getOwnerNamesForKpi } from '@/hooks/useOrgKpiDataOwner';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { ReviewLevelOverrideEditor, calculateOverriddenScore } from '@/components/review/ReviewLevelOverrideEditor';
import { useReviewerSubPeriodOverride } from '@/hooks/useReviewerSubPeriodOverride';
import { QualitativeOption, labelToRating, getQualitativeAchievedLabel } from '@/lib/qualitativeUom';
import { calculateRating } from '@/lib/ratingCalculation';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart, type CategorySortBy } from '@/components/dashboard/CategoryScoreChart';
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { QueryHistoryDialog } from '@/components/review/QueryHistoryDialog';
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
import { SendBackOrgKpiDialog } from '@/components/review/SendBackOrgKpiDialog';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Lock, MessageSquare, Undo2, Check, Briefcase, User, Shield, Calendar, ChevronDown, ChevronUp, Edit2, Send
} from 'lucide-react';
import { 
  statusColors,
  statusLabels,
  ratingOptions,
  getScoreBadgeClass,
  getScoreLabel,
} from '@/lib/reviewConstants';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { NaConfirmationCard } from '@/components/review/NaConfirmationCard';
import { OrgKpiRatingOverrideWarning } from '@/components/review/OrgKpiRatingOverrideWarning';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';
import { GovernanceLockBanner } from '@/components/review/GovernanceLockBanner';
import { SentBackBanner } from '@/components/review/SentBackBanner';

interface ManagementScorecardProps {
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

export function ManagementScorecard({ 
  employee, 
  selectedPeriod, 
  selectedYear, 
  onPeriodChange,
  onYearChange,
  onBack,
  autoOpenKpiId 
}: ManagementScorecardProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useKpisByEmployee(employee.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch workflow stages for this employee
  const { data: workflowStages } = useEmployeeWorkflowStages(employee.id, selectedPeriod, selectedYear);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const sendBackTargets = resolveSendBackTargets('management', effectiveStages);
  
  // Governance permissions
  const govPerms = useReviewPeriodPermissions(selectedPeriod, selectedYear);
  const isGovLocked = govPerms.view_only || (!govPerms.approve && !govPerms.edit_scores);
  
  // Filter KPIs by period and year, excluding non-issued (draft/template) KPIs (v1.45.94)
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

  // Org KPI send-back dialog state
  const [orgKpiSendBackOpen, setOrgKpiSendBackOpen] = useState(false);
  const [selectedOrgKpiForSendBack, setSelectedOrgKpiForSendBack] = useState<KPI | null>(null);

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

  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null);
  const [expandedDailyKpis, setExpandedDailyKpis] = useState<Set<string>>(new Set());
  const [categorySortBy, setCategorySortBy] = useState<CategorySortBy>('score-desc');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  
  const [managementScore, setManagementScore] = useState<number | null>(null);
  const [managementRemarks, setManagementRemarks] = useState('');
  const [managementEvidenceUrls, setManagementEvidenceUrls] = useState<string[]>([]);
  const [managementAchievedValue, setManagementAchievedValue] = useState<number | string | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<string>('auditor');
  
  // Management daily override state
  const [managementAgrees, setManagementAgrees] = useState<boolean | null>(null);
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
  
  // Org KPI override warning state
  const [orgOverrideWarningOpen, setOrgOverrideWarningOpen] = useState(false);
  const [pendingApproveAction, setPendingApproveAction] = useState<boolean | null>(null);
  
  const { saveOverrides, acceptPreviousLevel, isLoading: isSavingOverrides } = useReviewerSubPeriodOverride();

  const submissionMap = useMemo(() => new Map(submissions?.map(s => [s.kpi_id, s])), [submissions]);
  const queryMap = useMemo(() => {
    const map = new Map<string, typeof queries>();
    queries?.forEach(q => {
      const existing = map.get(q.kpi_id) || [];
      map.set(q.kpi_id, [...existing, q]);
    });
    return map;
  }, [queries]);

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
      
      const score = submission?.management_score ?? submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? 0;
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

  // Stats for management review
  const pendingReviewCount = kpis?.filter(k => k.status === 'management_review').length || 0;
  const approvedCount = kpis?.filter(k => k.status === 'approved').length || 0;
  const auditCompleteCount = kpis?.filter(k => ['audit', 'management_review', 'approved'].includes(k.status || '')).length || 0;
  const totalKpis = kpis?.length || 0;

  // Drafted KPIs: scored at management level but not yet approved
  const draftedKpis = useMemo(() => {
    if (!kpis || !submissions) return [];
    return kpis.filter(k => {
      if (k.status !== 'management_review') return false;
      const sub = submissionMap.get(k.id);
      return sub?.management_score != null;
    });
  }, [kpis, submissions, submissionMap]);
  const draftedCount = draftedKpis.length;

  // Bulk approve confirmation dialog state
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);

  const bulkApproveManagement = useMutation({
    mutationFn: async () => {
      for (const kpi of draftedKpis) {
        const sub = submissionMap.get(kpi.id);
        if (!sub || sub.management_score == null) continue;

        const mgmtRating = sub.management_rating || scoreToRating(sub.management_score);

        await supabase
          .from('review_submissions')
          .update({
            final_score: sub.management_score,
            final_rating: mgmtRating,
          })
          .eq('kpi_id', kpi.id);

        await supabase
          .from('kpis')
          .update({ status: 'approved' as any })
          .eq('id', kpi.id);

        if (user?.id) {
          await supabase.from('kpi_audit_logs').insert({
            kpi_id: kpi.id,
            action: 'MANAGEMENT_APPROVED',
            performed_by: user.id,
            new_value: { management_score: sub.management_score, management_rating: mgmtRating },
            metadata: { approved_at: new Date().toISOString(), bulk_approve: true },
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: `${draftedKpis.length} KPIs approved successfully` });
      setBulkApproveDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Bulk approve failed', description: error.message, variant: 'destructive' });
    },
  });

  const submitManagementReview = useMutation({
    mutationFn: async ({
      kpi_id,
      management_rating,
      management_score,
      management_remarks,
      management_evidence_url,
      management_achieved_value,
      approve,
    }: {
      kpi_id: string;
      management_rating: RatingLevel;
      management_score: number;
      management_remarks: string;
      management_evidence_url?: string | null;
      management_achieved_value?: number | null;
      approve: boolean;
    }) => {
      const updatePayload: any = {
        management_rating,
        management_score,
        management_remarks,
        management_evidence_url,
        management_achieved_value,
      };
      // Only write final_score/final_rating on approval to prevent stale values
      if (approve) {
        updatePayload.final_rating = management_rating;
        updatePayload.final_score = management_score;
      } else {
        updatePayload.final_score = null;
        updatePayload.final_rating = null;
      }

      const { data: updateData, error: submissionError } = await supabase
        .from('review_submissions')
        .update(updatePayload)
        .eq('kpi_id', kpi_id)
        .select();

      if (submissionError) throw submissionError;

      // Check if any rows were actually updated (RLS may block silently)
      if (!updateData || updateData.length === 0) {
        throw new Error('Unable to submit management review. You may not have permission, or the KPI is not at the correct stage.');
      }

      const newStatus = approve ? 'approved' : 'management_review';
      const { data: kpiUpdateData, error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id)
        .select();

      if (kpiError) throw kpiError;

      // Verify KPI was also updated
      if (!kpiUpdateData || kpiUpdateData.length === 0) {
        throw new Error('Unable to update KPI status. Permission denied.');
      }

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: approve ? 'MANAGEMENT_APPROVED' : 'MANAGEMENT_REVIEWED',
          performed_by: user.id,
          new_value: { management_rating, management_score, management_remarks },
          metadata: { approved_at: approve ? new Date().toISOString() : null },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: 'Management review submitted successfully' });
      setReviewSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit review', description: error.message, variant: 'destructive' });
    },
  });

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
      // Use workflow engine to resolve the correct pending status
      const newStatus = resolveSendBackStatus(target, 'management', effectiveStages);

      // Stamp reviewer remark into transaction-local var so the
      // notify_on_kpi_status_change trigger can include it in metadata.send_back_reason
      // (consumed by the manager_rejected email template).
      await supabase.rpc('record_send_back_reason' as any, { p_reason: reason });

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // Cascade-clear all downstream review data from target stage forward
      // Build the clear object based on which stages need clearing
      const clearFields: Record<string, null> = {};
      
      // Determine which levels to clear based on the target
      // We always clear management data since we're sending back FROM management
      const levelsToClear: string[] = ['management'];
      
      // Map targets to the review levels that come AFTER them
      const targetLevelOrder = ['employee', 'manager', 'skip_level', 'hr_pms', 'auditor', 'management'];
      const targetIdx = targetLevelOrder.indexOf(target);
      if (targetIdx >= 0) {
        // Clear all levels from target onward (excluding employee which has no submission fields)
        for (let i = Math.max(targetIdx, 1); i < targetLevelOrder.length; i++) {
          if (!levelsToClear.includes(targetLevelOrder[i])) {
            levelsToClear.push(targetLevelOrder[i]);
          }
        }
      }

      // Build clear fields for each level
      if (levelsToClear.includes('manager')) {
        clearFields.manager_rating = null;
        clearFields.manager_score = null;
        clearFields.manager_remarks = null;
        clearFields.manager_evidence_url = null;
        clearFields.manager_achieved_value = null;
      }
      if (levelsToClear.includes('skip_level')) {
        clearFields.skip_level_rating = null;
        clearFields.skip_level_score = null;
        clearFields.skip_level_remarks = null;
        clearFields.skip_level_evidence_url = null;
        clearFields.skip_level_achieved_value = null;
      }
      if (levelsToClear.includes('hr_pms')) {
        clearFields.hr_pms_rating = null;
        clearFields.hr_pms_score = null;
        clearFields.hr_pms_remarks = null;
        clearFields.hr_pms_evidence_url = null;
        clearFields.hr_pms_achieved_value = null;
      }
      if (levelsToClear.includes('auditor')) {
        clearFields.auditor_rating = null;
        clearFields.auditor_score = null;
        clearFields.auditor_remarks = null;
        clearFields.auditor_evidence_url = null;
        clearFields.auditor_achieved_value = null;
      }
      if (levelsToClear.includes('management')) {
        clearFields.management_rating = null;
        clearFields.management_score = null;
        clearFields.management_remarks = null;
        clearFields.management_evidence_url = null;
        clearFields.management_achieved_value = null;
        clearFields.final_rating = null;
        clearFields.final_score = null;
      }

      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update(clearFields)
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: `MANAGEMENT_SENT_BACK_TO_${target.toUpperCase()}`,
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
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['send-back-reason'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-journey-audit-logs'] });
      toast({ title: 'KPI sent back successfully' });
      setSendBackDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send back', description: error.message, variant: 'destructive' });
    },
  });

  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    const uomType = (kpi as any).uom_type as 'numeric' | 'binary' | 'tiered' | undefined;
    const qualOpts = (kpi as any).qualitative_options as QualitativeOption[] | null;
    const isQualitative = uomType === 'binary' || uomType === 'tiered';
    const hasMgmtDraft =
      existing?.management_score != null ||
      (existing as any)?.management_rating != null ||
      (typeof existing?.management_remarks === 'string' && existing.management_remarks.trim() !== '') ||
      (existing as any)?.management_achieved_value != null;
    const rawMgmtAchieved = (existing as any)?.management_achieved_value ?? null;

    // Picker hydration — for qualitative drafts, derive from management_score (canonical)
    // resolved against THIS kpi's qualitative_options so the Review Journey tile and the
    // picker tile cannot diverge. Never inherit the employee's value when a draft exists.
    let mgmtAchieved: number | string | null;
    if (hasMgmtDraft) {
      if (isQualitative) {
        const numeric =
          existing?.management_score != null
            ? Number(existing.management_score)
            : (rawMgmtAchieved != null ? Number(rawMgmtAchieved) : null);
        mgmtAchieved = getQualitativeAchievedLabel(numeric, uomType, qualOpts) ?? null;
      } else {
        mgmtAchieved = rawMgmtAchieved;
      }
    } else if (isQualitative) {
      mgmtAchieved = getQualitativeAchievedLabel(existing?.achieved_value ?? null, uomType, qualOpts) ?? null;
    } else {
      mgmtAchieved = rawMgmtAchieved;
    }

    // Recalculate score from achieved value if management hasn't reviewed yet
    let initialMgmtScore: number | null = existing?.management_score ?? null;
    if (initialMgmtScore === null && mgmtAchieved !== null && mgmtAchieved !== '') {
      const numVal = typeof mgmtAchieved === 'number' ? mgmtAchieved : parseFloat(String(mgmtAchieved));
      if (!isNaN(numVal)) {
        const result = calculateRating(
          numVal,
          kpi.target_value,
          { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
          kpi.criteria || 'Higher is Better',
          kpi.weightage || 0,
          (kpi as any).uom_type || 'numeric',
          (kpi as any).qualitative_options || null,
          kpi.uom || null,
          (kpi as any).threshold_mode || 'absolute'
        );
        initialMgmtScore = result.rating;
      }
    }
    // Legacy fallback: inherit auditor's score only if recalculation wasn't possible
    if (initialMgmtScore === null) {
      initialMgmtScore = existing?.auditor_score ?? null;
    }
    setManagementScore(initialMgmtScore);
    setManagementRemarks(existing?.management_remarks || '');
    // Support both new array and legacy single URL
    const existingUrls = (existing as any)?.management_evidence_urls;
    setManagementEvidenceUrls(Array.isArray(existingUrls) && existingUrls.length > 0 
      ? existingUrls 
      : existing?.management_evidence_url ? [existing.management_evidence_url] : []);
    setManagementAchievedValue(mgmtAchieved);
    // Reset override state
    setManagementAgrees(null);
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

  const handleSubmitReview = async (approve: boolean) => {
    if (!selectedKpi) return;
    
    const submission = submissionMap.get(selectedKpi.id);
    const isNaKpi = submission?.is_na || false;
    
    // For N/A KPIs — override or confirm
    if (isNaKpi) {
      if (naOverridden) {
        if (!overrideNaRemarks.trim()) return;
        if (managementScore === null) return;
        const rating = scoreToRating(managementScore);
        const { error: submissionError } = await supabase.from('review_submissions').update({
          is_na: false, na_marked_by_role: null,
          management_rating: rating, management_score: managementScore, management_remarks: overrideNaRemarks,
          management_evidence_url: managementEvidenceUrls.length > 0 ? managementEvidenceUrls[0] : null,
          final_rating: rating, final_score: managementScore,
        }).eq('kpi_id', selectedKpi.id);
        if (submissionError) { toast({ title: 'Failed to override N/A', description: submissionError.message, variant: 'destructive' }); return; }
        const newStatus = approve ? 'approved' : 'management_review';
        const { error: kpiError } = await supabase.from('kpis').update({ status: newStatus as any }).eq('id', selectedKpi.id);
        if (kpiError) { toast({ title: 'Failed to update status', description: kpiError.message, variant: 'destructive' }); return; }
        if (user?.id) { await supabase.from('kpi_audit_logs').insert({ kpi_id: selectedKpi.id, action: 'MANAGEMENT_NA_OVERRIDDEN', performed_by: user.id, new_value: { override_remarks: overrideNaRemarks, score: managementScore }, metadata: { overridden_at: new Date().toISOString() } }); }
        queryClient.invalidateQueries({ queryKey: ['kpis'] }); queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
        toast({ title: 'N/A overridden — KPI scored and approved' }); setReviewSheetOpen(false); return;
      }
      if (!naConfirmed) return;
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({ kpi_id: selectedKpi.id, action: 'MANAGEMENT_NA_CONFIRMED', performed_by: user.id, new_value: { na_remarks: naRemarks }, metadata: { confirmed_at: new Date().toISOString() } });

        // Persist N/A remarks to review_submissions so Review Journey tiles show them
        if (naRemarks.trim()) {
          await supabase.from('review_submissions')
            .update({ management_remarks: naRemarks } as any)
            .eq('kpi_id', selectedKpi.id);
        }
      }
      const newStatus = approve ? 'approved' : 'management_review';
      const { error: kpiError } = await supabase.from('kpis').update({ status: newStatus as any }).eq('id', selectedKpi.id);
      if (kpiError) { toast({ title: 'Failed to process N/A KPI', description: kpiError.message, variant: 'destructive' }); return; }
      queryClient.invalidateQueries({ queryKey: ['kpis'] }); queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: approve ? 'N/A KPI approved' : 'N/A KPI confirmed' }); setReviewSheetOpen(false); return;
    }
    
    // Reviewer-initiated N/A flow
    if (reviewerMarkNa) {
      if (!markNaRemarks.trim()) return;
      
      const { error: naError } = await supabase
        .from('review_submissions')
        .update({
          is_na: true,
          na_marked_by_role: 'management',
          management_remarks: markNaRemarks,
        })
        .eq('kpi_id', selectedKpi.id);
      
      if (naError) {
        toast({ title: 'Failed to mark N/A', description: naError.message, variant: 'destructive' });
        return;
      }
      
      const newStatus = approve ? 'approved' : 'management_review';
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
          action: 'MANAGEMENT_MARKED_NA',
          performed_by: user.id,
          new_value: { reason: markNaRemarks },
          metadata: { marked_na_at: new Date().toISOString() },
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: approve ? 'Marked N/A & approved' : 'Marked as N/A' });
      setReviewSheetOpen(false);
      return;
    }
    
    // Regular KPI flow
    if (managementScore === null) return;
    
    // Org KPI override warning check
    if (selectedKpi.is_org_level) {
      const previousScore = submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? null;
      if (previousScore !== null && previousScore !== undefined && managementScore !== previousScore) {
        setPendingApproveAction(approve);
        setOrgOverrideWarningOpen(true);
        return;
      }
    }

    await executeManagementSubmit(approve);
  };

  const executeManagementSubmit = async (approve: boolean) => {
    if (!selectedKpi || managementScore === null) return;
    const submission = submissionMap.get(selectedKpi.id);

    const isDailyBinary = selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary';
    
    // For daily binary KPIs, persist management values
    if (isDailyBinary) {
      if (managementAgrees === false && dailyOverrides.size > 0) {
        const overrideEntries = Array.from(dailyOverrides.entries()).map(([date, value]) => ({
          sub_period_value: date,
          achieved_value: value,
          original_value: null,
        }));
        
        const originalScore = submission?.auditor_score || null;
        
        await saveOverrides.mutateAsync({
          kpi_id: selectedKpi.id,
          employee_id: employee.id,
          review_level: 'management',
          overrides: overrideEntries,
          reason: overrideReason,
          review_month: selectedPeriod,
          review_year: selectedYear,
          original_score: originalScore,
          new_score: managementScore,
        });
      } else {
        await acceptPreviousLevel.mutateAsync({
          kpi_id: selectedKpi.id,
          review_level: 'management',
          review_month: selectedPeriod,
          review_year: selectedYear,
        });
      }
    }
    
    const uomType = (selectedKpi as any).uom_type as 'numeric' | 'binary' | 'tiered' | undefined;
    const qualOpts = (selectedKpi as any).qualitative_options as QualitativeOption[] | null;
    const isQualitative = uomType === 'binary' || uomType === 'tiered';
    let mgmtAchievedToSave: number | null;
    let mgmtScoreToSave: number | null = managementScore;
    if (isQualitative) {
      const r = labelToRating(managementAchievedValue, uomType, qualOpts);
      mgmtAchievedToSave = r ?? managementScore ?? null;
      if (r !== null) mgmtScoreToSave = r;
    } else if (typeof managementAchievedValue === 'number') {
      mgmtAchievedToSave = Number.isFinite(managementAchievedValue) ? managementAchievedValue : null;
    } else if (managementAchievedValue) {
      const n = parseFloat(String(managementAchievedValue));
      mgmtAchievedToSave = Number.isFinite(n) ? n : null;
    } else {
      mgmtAchievedToSave = null;
    }
    const ratingToSave = scoreToRating(mgmtScoreToSave);
    submitManagementReview.mutate({
      kpi_id: selectedKpi.id,
      management_rating: ratingToSave,
      management_score: mgmtScoreToSave,
      management_remarks: managementRemarks,
      management_evidence_url: managementEvidenceUrls.length > 0 ? managementEvidenceUrls[0] : null,
      management_achieved_value: mgmtAchievedToSave,
      approve,
    });
  };

  const handleOrgOverrideConfirm = () => {
    setOrgOverrideWarningOpen(false);
    if (pendingApproveAction !== null) {
      executeManagementSubmit(pendingApproveAction);
    }
    setPendingApproveAction(null);
  };

  const openSendBackDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget(sendBackTargets.length > 0 ? sendBackTargets[0].value : 'employee');
    setSendBackDialogOpen(true);
  };

  const handleSendBack = () => {
    if (!selectedKpi || !sendBackReason.trim()) return;
    sendBack.mutate({
      kpi_id: selectedKpi.id,
      target: sendBackTarget,
      reason: sendBackReason,
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
      {/* Governance Lock Banner */}
      <GovernanceLockBanner permissions={govPerms} viewLevel="management" />

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
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Pending</p>
                <p className="text-lg sm:text-2xl font-bold text-emerald-600">{pendingReviewCount}</p>
              </div>
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Progress</p>
                <p className="text-2xl font-bold text-blue-600">
                  {totalKpis > 0 ? Math.round((approvedCount / totalKpis) * 100) : 0}%
                </p>
              </div>
              <div className="h-5 w-5 rounded-full border-2 border-blue-500 flex items-center justify-center">
                <div 
                  className="h-2.5 w-2.5 rounded-full bg-blue-500" 
                  style={{ transform: `scale(${approvedCount / totalKpis || 0})` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Approve Drafted KPIs */}
      {draftedCount > 0 && !isGovLocked && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {draftedCount} KPI{draftedCount > 1 ? 's' : ''} drafted but not approved
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => setBulkApproveDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Approve All Drafted
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bulk Approve Confirmation Dialog */}
      <ConfirmDestructiveDialog
        open={bulkApproveDialogOpen}
        onConfirm={() => bulkApproveManagement.mutate()}
        onCancel={() => setBulkApproveDialogOpen(false)}
        title={`Approve ${draftedCount} Drafted KPIs?`}
        description={`This will finalize ${draftedCount} KPI${draftedCount > 1 ? 's' : ''} that have management scores saved as drafts. Each KPI's management score will become the final score. This action cannot be undone.`}
        confirmLabel="Approve All"
        isLoading={bulkApproveManagement.isPending}
      />

      {/* KPI Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            KPI Details - Management Review
          </CardTitle>
          <CardDescription>Review and approve KPIs for final scoring</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isMobile ? (
            <div className="space-y-3">
              {(statusFilter ? (kpis || []).filter(k => k.status === statusFilter) : (kpis || [])).map(kpi => {
                const submission = submissionMap.get(kpi.id);
                return (
                  <MobileKpiCard
                    key={kpi.id}
                    kpi={kpi}
                    submission={submission}
                    viewType="management"
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
              {(!kpis || kpis.length === 0) && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No KPIs found for this period
                </p>
              )}
            </div>
          ) : (
            <KpiDetailsTable
              kpis={statusFilter ? (kpis || []).filter(k => k.status === statusFilter) : (kpis || [])}
              submissionMap={submissionMap}
              queryMap={queryMap as Map<string, KpiQuery[]>}
              viewType="management"
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

      {/* Management Review Sheet */}
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="pb-3 sm:pb-4 border-b">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
              </div>
              <div>
                <SheetTitle className="text-base sm:text-lg">Management Review</SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">Final review and approval</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-3 sm:space-y-4 py-3 sm:py-4">
            {/* KPI Review Panel - Unified Header, Metrics, Journey & History */}
            {selectedKpi && (
              <KpiReviewPanel
                kpi={selectedKpi}
                submission={submissionMap.get(selectedKpi.id) || null}
                allKpis={allKpis || []}
                allSubmissions={allSubmissions || []}
                queries={queryMap.get(selectedKpi.id) || []}
                viewLevel="management"
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onOpenQueryHistory={() => setHistoryDialogOpen(true)}
                onOpenFullHistory={() => setTrackerModalOpen(true)}
                onOpenTimeline={() => setTimelineOpen(true)}
                workflowStages={effectiveStages}
                orgKpiEnteredByName={getOrgKpiValue(selectedKpi)?.entered_by_name}
                orgKpiDataOwnerNames={getOwnerNamesForKpi(dataOwnerNamesMap, selectedKpi)}
                employeeName={employee.full_name || undefined}
                employeeCode={employee.employee_code || undefined}
              />
            )}
            
            {/* Sent Back Banner */}
            {selectedKpi && (
              <SentBackBanner kpiId={selectedKpi.id} />
            )}

            {/* N/A Confirmation Card */}
            {selectedKpi && submissionMap.get(selectedKpi.id)?.is_na && (
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
                reviewerLevel="Management"
                naMarkedByRole={(submissionMap.get(selectedKpi.id) as any)?.na_marked_by_role || null}
                naOverridden={naOverridden}
                onOverrideNa={setNaOverridden}
                overrideRemarks={overrideNaRemarks}
                onOverrideRemarksChange={setOverrideNaRemarks}
              />
            )}
            {/* Reviewer-initiated Mark as N/A */}
            {selectedKpi && !submissionMap.get(selectedKpi.id)?.is_na && (
              <NaConfirmationCard
                selfRemarks={null}
                confirmed={false}
                onConfirmChange={() => {}}
                remarks=""
                onRemarksChange={() => {}}
                reviewerLevel="Management"
                canMarkNa
                reviewerMarkedNa={reviewerMarkNa}
                onReviewerMarkNa={setReviewerMarkNa}
                markNaRemarks={markNaRemarks}
                onMarkNaRemarksChange={setMarkNaRemarks}
              />
            )}
            
            {/* Daily Submission Summary with Override - for Daily Binary KPIs */}
            {selectedKpi && !reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && (
              <DailySubmissionWithOverrideWrapper 
                kpi={selectedKpi} 
                selectedPeriod={selectedPeriod} 
                selectedYear={selectedYear}
                employee={employee}
                reviewerAgrees={managementAgrees}
                onReviewerAgreesChange={setManagementAgrees}
                dailyOverrides={dailyOverrides}
                onDailyOverridesChange={setDailyOverrides}
                overrideReason={overrideReason}
                onOverrideReasonChange={setOverrideReason}
                reviewerScore={managementScore}
                onReviewerScoreChange={setManagementScore}
                submissionMap={submissionMap}
                reviewLevel="management"
              />
            )}

            {/* Management Assessment - Only show for non-daily-binary or when agrees, and not when reviewer marked N/A */}
            {selectedKpi && !reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && !(selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary') && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                    Management Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AchievedValueScoreInput
                    kpi={selectedKpi}
                    achievedValue={managementAchievedValue}
                    score={managementScore}
                    onAchievedValueChange={setManagementAchievedValue}
                    onScoreChange={(score, rating) => setManagementScore(score)}
                    label="Management Assessment"
                    reviewMonth={selectedPeriod}
                    reviewYear={selectedYear}
                  />
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      placeholder="Add your review comments..."
                      value={managementRemarks}
                      onChange={(e) => setManagementRemarks(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Evidence</Label>
                    <MultiFileUpload
                      userId={user?.id || ''}
                      contextId={selectedKpi?.id || ''}
                      folder="management-evidence"
                      existingUrls={managementEvidenceUrls}
                      onUploadComplete={setManagementEvidenceUrls}
                      label="Management Evidence"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Remarks for Daily Binary - shown separately */}
            {selectedKpi && !reviewerMarkNa && (!submissionMap.get(selectedKpi.id)?.is_na || naOverridden) && selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary' && managementAgrees !== null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                    Management Remarks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      placeholder="Add your review comments..."
                      value={managementRemarks}
                      onChange={(e) => setManagementRemarks(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Evidence</Label>
                    <MultiFileUpload
                      userId={user?.id || ''}
                      contextId={selectedKpi?.id || ''}
                      folder="management-evidence"
                      existingUrls={managementEvidenceUrls}
                      onUploadComplete={setManagementEvidenceUrls}
                      label="Management Evidence"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <SheetFooter className="flex-col sm:flex-row pt-4 border-t gap-2">
            {/* Send Back button */}
            <Button
              variant="outline"
              className="w-full sm:w-auto text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={() => {
                setReviewSheetOpen(false);
                if (selectedKpi) {
                  setSendBackReason('');
                  setSendBackTarget(sendBackTargets.length > 0 ? sendBackTargets[0].value : 'employee');
                  setSendBackDialogOpen(true);
                }
              }}
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Send Back
            </Button>
            
            <div className="hidden sm:block flex-1" /> {/* Spacer - hidden on mobile */}
            
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReviewSheetOpen(false)}>
              Cancel
            </Button>
            {(!submissionMap.get(selectedKpi?.id || '')?.is_na || naOverridden) && !reviewerMarkNa && (
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => handleSubmitReview(false)} disabled={managementScore === null || submitManagementReview.isPending || !govPerms.edit_scores}>Save Draft</Button>
            )}
            <Button className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSubmitReview(true)}
              disabled={
                isGovLocked ||
                (reviewerMarkNa ? !markNaRemarks.trim() :
                (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden) ? (!overrideNaRemarks.trim() || managementScore === null) :
                submissionMap.get(selectedKpi?.id || '')?.is_na ? !naConfirmed :
                (managementScore === null || submitManagementReview.isPending))
              }
            >
              <Check className="h-4 w-4 mr-2" />
              {reviewerMarkNa ? 'Mark N/A & Approve'
                : (submissionMap.get(selectedKpi?.id || '')?.is_na && naOverridden) ? 'Override N/A & Approve'
                : submissionMap.get(selectedKpi?.id || '')?.is_na ? 'Confirm N/A & Approve'
                : 'Approve'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Send Back Dialog */}
      <Dialog open={sendBackDialogOpen} onOpenChange={setSendBackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Back KPI</DialogTitle>
            <DialogDescription>
              Send this KPI back for revision. Select who should receive it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Send To</Label>
              <div className="flex flex-wrap gap-2">
                {sendBackTargets.map(target => (
                  <Button
                    key={target.value}
                    variant={sendBackTarget === target.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSendBackTarget(target.value)}
                  >
                    {(target.value === 'auditor' || target.value === 'hr_pms') && <Shield className="h-4 w-4 mr-1" />}
                    {(target.value === 'manager' || target.value === 'employee' || target.value === 'skip_level') && <User className="h-4 w-4 mr-1" />}
                    {target.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Explain why this KPI needs revision..."
                value={sendBackReason}
                onChange={(e) => setSendBackReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendBackDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendBack}
              disabled={!sendBackReason.trim() || sendBack.isPending}
              variant="destructive"
            >
              <Undo2 className="h-4 w-4 mr-2" />
              Send Back
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
      {/* Org KPI Rating Override Warning */}
      <OrgKpiRatingOverrideWarning
        open={orgOverrideWarningOpen}
        onConfirm={handleOrgOverrideConfirm}
        onCancel={() => { setOrgOverrideWarningOpen(false); setPendingApproveAction(null); }}
        kpiName={selectedKpi?.kpi_name || ''}
        originalScore={(() => {
          const sub = selectedKpi ? submissionMap.get(selectedKpi.id) : null;
          return (sub?.auditor_score ?? sub?.manager_score ?? sub?.self_score) as number ?? 0;
        })()}
        originalEnteredBy={(() => {
          if (!selectedKpi?.is_org_level) return null;
          const orgVal = getOrgKpiValue(selectedKpi);
          return orgVal?.entered_by_name || null;
        })()}
        newScore={managementScore ?? 0}
      />
    </div>
  );
}

// Helper wrapper that fetches sub-period submissions for Daily KPIs with override support
function DailySubmissionWithOverrideWrapper({ 
  kpi, 
  selectedPeriod, 
  selectedYear,
  employee,
  reviewerAgrees,
  onReviewerAgreesChange,
  dailyOverrides,
  onDailyOverridesChange,
  overrideReason,
  onOverrideReasonChange,
  reviewerScore,
  onReviewerScoreChange,
  submissionMap,
  reviewLevel,
}: { 
  kpi: KPI; 
  selectedPeriod: string; 
  selectedYear: number;
  employee: { id: string };
  reviewerAgrees: boolean | null;
  onReviewerAgreesChange: (agrees: boolean | null) => void;
  dailyOverrides: Map<string, number>;
  onDailyOverridesChange: (overrides: Map<string, number>) => void;
  overrideReason: string;
  onOverrideReasonChange: (reason: string) => void;
  reviewerScore: number | null;
  onReviewerScoreChange: (score: number | null) => void;
  submissionMap: Map<string, any>;
  reviewLevel: 'manager' | 'auditor' | 'management';
}) {
  const { data: submissions } = useSubPeriodSubmissions(
    kpi.frequency === 'Daily' ? kpi.id : undefined, 
    selectedPeriod, 
    selectedYear
  );
  
  const isDailyBinary = kpi.frequency === 'Daily' && kpi.uom_type === 'binary';
  const existingSubmission = submissionMap.get(kpi.id);
  
  const previousLevelScore = React.useMemo(() => {
    if (reviewLevel === 'management') return existingSubmission?.auditor_score ?? existingSubmission?.manager_score ?? null;
    return existingSubmission?.manager_score ?? null;
  }, [reviewLevel, existingSubmission]);
  
  const previousLevelRemarks = React.useMemo(() => {
    if (reviewLevel === 'management') return existingSubmission?.auditor_remarks || existingSubmission?.manager_remarks || null;
    return existingSubmission?.manager_remarks || null;
  }, [reviewLevel, existingSubmission]);
  
  React.useEffect(() => {
    if (!isDailyBinary) return;
    
    if (reviewerAgrees === true) {
      onReviewerScoreChange(previousLevelScore);
    } else if (reviewerAgrees === false && submissions) {
      const result = calculateOverriddenScore(submissions, dailyOverrides, selectedPeriod, selectedYear);
      onReviewerScoreChange(result.score);
    }
  }, [reviewerAgrees, dailyOverrides, submissions, previousLevelScore, isDailyBinary, selectedPeriod, selectedYear, onReviewerScoreChange]);
  
  if (kpi.frequency !== 'Daily' || !submissions || submissions.length === 0) {
    return null;
  }
  
  // getScoreLabel and getScoreBadgeClass imported from reviewConstants
  
  return (
    <div className="space-y-4">
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
        managerOverrides={dailyOverrides.size > 0 ? dailyOverrides : undefined}
      />
      
      {isDailyBinary && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Do you agree with the previous level's submissions?</Label>
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
            <ReviewLevelOverrideEditor
              kpiId={kpi.id}
              reviewMonth={selectedPeriod}
              reviewYear={selectedYear}
              submissions={submissions}
              overrides={dailyOverrides}
              onOverridesChange={onDailyOverridesChange}
              overrideReason={overrideReason}
              onReasonChange={onOverrideReasonChange}
              originalScore={previousLevelScore}
              reviewLevel={reviewLevel}
              previousLevelRemarks={previousLevelRemarks}
            />
          )}
          
          {reviewerAgrees !== null && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {reviewerAgrees === false ? 'Recalculated Management Score' : 'Management Score (Accepted)'}
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

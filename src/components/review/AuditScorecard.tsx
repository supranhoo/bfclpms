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
import { useKpisByEmployee, useReviewSubmissions, useKpiQueries, RatingLevel, KPI, KpiQuery } from '@/hooks/useKpis';
import { useSubPeriodSubmissions, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useOrgKpiValues } from '@/hooks/useOrgKpiValues';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { ReviewLevelOverrideEditor, calculateOverriddenScore } from '@/components/review/ReviewLevelOverrideEditor';
import { useReviewerSubPeriodOverride } from '@/hooks/useReviewerSubPeriodOverride';
import { QualitativeOption } from '@/lib/qualitativeUom';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import { OverallScoreChart } from '@/components/dashboard/OverallScoreChart';
import { CategoryScoreChart } from '@/components/dashboard/CategoryScoreChart';
import { KpiReviewPanel } from '@/components/review/KpiReviewPanel';
import { WorkflowProgressTracker } from '@/components/review/WorkflowProgressTracker';
import { AchievedValueScoreInput } from '@/components/review/AchievedValueScoreInput';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { KpiLogicModal } from '@/components/dashboard/KpiLogicModal';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { QueryHistoryDialog } from '@/components/review/QueryHistoryDialog';
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
import { scoreToRating } from '@/components/review/ScoreSelector';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Target, CheckCircle2, Clock, 
  Info, Undo2, Check, Shield, User, FileCheck, Calendar, ChevronDown, ChevronUp, Edit2, Send
} from 'lucide-react';
import { 
  statusColors,
  statusLabels,
  ratingOptions
} from '@/lib/reviewConstants';
import { MobileKpiCard } from '@/components/review/MobileKpiCard';
import { NaConfirmationCard } from '@/components/review/NaConfirmationCard';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { 
  DEFAULT_WORKFLOW_STAGES, 
  resolveForwardStatus, 
  resolveSendBackStatus, 
  resolveSendBackTargets,
  resolvePendingStatuses 
} from '@/lib/workflowEngine';

interface AuditScorecardProps {
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

export function AuditScorecard({ 
  employee, 
  selectedPeriod, 
  selectedYear, 
  onPeriodChange,
  onYearChange,
  onBack,
  autoOpenKpiId 
}: AuditScorecardProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { data: allKpis, isLoading } = useKpisByEmployee(employee.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch the employee's workflow stages dynamically
  const { data: workflowStages } = useEmployeeWorkflowStages(employee.id);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  
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

  const kpiIds = kpis?.map(k => k.id) || [];
  const { data: submissions } = useReviewSubmissions(kpiIds);
  const { data: queries } = useKpiQueries(kpiIds);

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
  
  const [auditorScore, setAuditorScore] = useState<number | null>(null);
  const [auditorRemarks, setAuditorRemarks] = useState('');
  const [auditorEvidenceUrls, setAuditorEvidenceUrls] = useState<string[]>([]);
  const [auditorAchievedValue, setAuditorAchievedValue] = useState<number | string | null>(null);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sendBackTarget, setSendBackTarget] = useState<'manager' | 'employee'>('manager');
  
  // Auditor daily override state
  const [auditorAgrees, setAuditorAgrees] = useState<boolean | null>(null);
  const [dailyOverrides, setDailyOverrides] = useState<Map<string, number>>(new Map());
  const [overrideReason, setOverrideReason] = useState('');
  
  // N/A confirmation state
  const [naConfirmed, setNaConfirmed] = useState(false);
  const [naRemarks, setNaRemarks] = useState('');
  
  // Reviewer-initiated N/A state
  const [reviewerMarkNa, setReviewerMarkNa] = useState(false);
  const [markNaRemarks, setMarkNaRemarks] = useState('');
  
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

  // Calculate scores
  const scoreData = useMemo(() => {
    if (!kpis || !submissions) return { overallScore: 0, rating: 0, categoryScores: [] };
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryMap = new Map<string, { totalScore: number; totalWeight: number; color: string | null }>();
    
    kpis.forEach(kpi => {
      const submission = submissionMap.get(kpi.id);
      if (submission?.is_na) return; // Skip NA KPIs
      
      const score = submission?.auditor_score ?? submission?.manager_score ?? submission?.self_score ?? 0;
      const weight = kpi.weightage || 0;
      const categoryName = kpi.kra_categories?.name || 'Other';
      const categoryColor = kpi.kra_categories?.color || null;
      
      if (score > 0 && weight > 0) {
        totalWeightedScore += score * weight;
        totalWeight += weight;
        
        const existing = categoryMap.get(categoryName) || { totalScore: 0, totalWeight: 0, color: categoryColor };
        existing.totalScore += score * weight;
        existing.totalWeight += weight;
        categoryMap.set(categoryName, existing);
      }
    });
    
    const overallRating = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const overallScore = (overallRating / 5) * 100;
    
    const categoryScores = Array.from(categoryMap.entries()).map(([name, data]) => ({
      name,
      percentage: data.totalWeight > 0 ? ((data.totalScore / data.totalWeight) / 5) * 100 : 0,
      color: data.color,
    }));
    
    return { overallScore, rating: overallRating, categoryScores };
  }, [kpis, submissions, submissionMap]);

  // Stats for audit review - use workflow-aware pending statuses
  const auditPendingStatuses = resolvePendingStatuses('auditor', effectiveStages);
  const pendingAuditCount = kpis?.filter(k => auditPendingStatuses.includes(k.status || '')).length || 0;
  const inAuditCount = kpis?.filter(k => k.status === 'audit').length || 0;
  const forwardedCount = kpis?.filter(k => ['management_review', 'approved'].includes(k.status || '')).length || 0;
  const totalKpis = kpis?.length || 0;

  const submitAuditReview = useMutation({
    mutationFn: async ({
      kpi_id,
      auditor_rating,
      auditor_score,
      auditor_remarks,
      auditor_evidence_url,
      auditor_achieved_value,
      approve,
    }: {
      kpi_id: string;
      auditor_rating: RatingLevel;
      auditor_score: number;
      auditor_remarks: string;
      auditor_evidence_url?: string | null;
      auditor_achieved_value?: number | null;
      approve: boolean;
    }) => {
      const { data: updateData, error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          auditor_rating,
          auditor_score,
          auditor_remarks,
          auditor_evidence_url,
          auditor_achieved_value,
        })
        .eq('kpi_id', kpi_id)
        .select();

      if (submissionError) throw submissionError;

      // Check if any rows were actually updated (RLS may block silently)
      if (!updateData || updateData.length === 0) {
        throw new Error('Unable to submit audit review. You may not have permission, or the KPI is not at the correct stage.');
      }

      const newStatus = approve ? resolveForwardStatus('auditor', effectiveStages) : 'audit';
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
          action: approve ? 'AUDITOR_FORWARDED_TO_MANAGEMENT' : 'AUDITOR_REVIEWED',
          performed_by: user.id,
          new_value: { auditor_rating, auditor_score, auditor_remarks },
          metadata: { forwarded_at: approve ? new Date().toISOString() : null },
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ 
        title: variables.approve ? 'Forwarded to Management Review' : 'Audit review saved'
      });
      setReviewSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit audit', description: error.message, variant: 'destructive' });
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
      const newStatus = resolveSendBackStatus(target, 'auditor', effectiveStages);

      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: newStatus as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      const { error: submissionError } = await supabase
        .from('review_submissions')
        .update({
          auditor_rating: null,
          auditor_score: null,
          auditor_remarks: null,
        })
        .eq('kpi_id', kpi_id);

      if (submissionError) throw submissionError;

      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: `AUDITOR_SENT_BACK_TO_${target.toUpperCase()}`,
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

  const openReviewSheet = (kpi: KPI) => {
    setSelectedKpi(kpi);
    const existing = submissionMap.get(kpi.id);
    setAuditorScore(existing?.auditor_score || existing?.manager_score || null);
    setAuditorRemarks(existing?.auditor_remarks || '');
    // Support both new array and legacy single URL
    const existingUrls = (existing as any)?.auditor_evidence_urls;
    setAuditorEvidenceUrls(Array.isArray(existingUrls) && existingUrls.length > 0 
      ? existingUrls 
      : existing?.auditor_evidence_url ? [existing.auditor_evidence_url] : []);
    setAuditorAchievedValue((existing as any)?.auditor_achieved_value ?? (existing as any)?.manager_achieved_value ?? existing?.achieved_value ?? null);
    // Reset override state
    setAuditorAgrees(null);
    setDailyOverrides(new Map());
    setOverrideReason('');
    // Reset N/A confirmation state
    setNaConfirmed(false);
    setNaRemarks('');
    setReviewerMarkNa(false);
    setMarkNaRemarks('');
    setReviewSheetOpen(true);
  };

  const handleSubmitReview = async (approve: boolean) => {
    if (!selectedKpi) return;
    
    const submission = submissionMap.get(selectedKpi.id);
    const isNaKpi = submission?.is_na || false;
    
    // For N/A KPIs, handle confirmation and logging
    if (isNaKpi) {
      if (!naConfirmed) return;
      
      // Log N/A confirmation
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id: selectedKpi.id,
          action: 'AUDITOR_NA_CONFIRMED',
          performed_by: user.id,
          new_value: { na_remarks: naRemarks },
          metadata: { confirmed_at: new Date().toISOString() },
        });
      }
      
      // Advance status using workflow engine
      const newStatus = approve ? resolveForwardStatus('auditor', effectiveStages) : 'audit';
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
      toast({ title: approve ? 'N/A KPI forwarded to Management' : 'N/A KPI confirmed' });
      setReviewSheetOpen(false);
      return;
    }
    
    // Reviewer-initiated N/A flow
    if (reviewerMarkNa) {
      if (!markNaRemarks.trim()) return;
      
      // Set is_na and na_marked_by_role on submission
      const { error: naError } = await supabase
        .from('review_submissions')
        .update({
          is_na: true,
          na_marked_by_role: 'auditor',
          auditor_remarks: markNaRemarks,
        })
        .eq('kpi_id', selectedKpi.id);
      
      if (naError) {
        toast({ title: 'Failed to mark N/A', description: naError.message, variant: 'destructive' });
        return;
      }
      
      // Advance status
      const newStatus = approve ? resolveForwardStatus('auditor', effectiveStages) : 'audit';
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
          action: 'AUDITOR_MARKED_NA',
          performed_by: user.id,
          new_value: { reason: markNaRemarks },
          metadata: { marked_na_at: new Date().toISOString() },
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({ title: approve ? 'Marked N/A & forwarded to Management' : 'Marked as N/A' });
      setReviewSheetOpen(false);
      return;
    }
    
    // Regular KPI flow
    if (auditorScore === null) return;
    
    const isDailyBinary = selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary';
    
    // For daily binary KPIs, persist auditor values
    if (isDailyBinary) {
      if (auditorAgrees === false && dailyOverrides.size > 0) {
        // Auditor disagrees - save overrides
        const overrideEntries = Array.from(dailyOverrides.entries()).map(([date, value]) => ({
          sub_period_value: date,
          achieved_value: value,
          original_value: null,
        }));
        
        const originalScore = submission?.manager_score || null;
        
        await saveOverrides.mutateAsync({
          kpi_id: selectedKpi.id,
          employee_id: employee.id,
          review_level: 'auditor',
          overrides: overrideEntries,
          reason: overrideReason,
          review_month: selectedPeriod,
          review_year: selectedYear,
          original_score: originalScore,
          new_score: auditorScore,
        });
      } else {
        // Auditor agrees - copy manager values to auditor column
        await acceptPreviousLevel.mutateAsync({
          kpi_id: selectedKpi.id,
          review_level: 'auditor',
          review_month: selectedPeriod,
          review_year: selectedYear,
        });
      }
    }
    
    const rating = scoreToRating(auditorScore);
    submitAuditReview.mutate({
      kpi_id: selectedKpi.id,
      auditor_rating: rating,
      auditor_score: auditorScore,
      auditor_remarks: auditorRemarks,
      auditor_evidence_url: auditorEvidenceUrls.length > 0 ? auditorEvidenceUrls[0] : null,
      auditor_achieved_value: typeof auditorAchievedValue === 'number' 
        ? auditorAchievedValue 
        : auditorAchievedValue ? parseFloat(auditorAchievedValue) : null,
      approve,
    });
  };

  const openSendBackDialog = (kpi: KPI) => {
    setSelectedKpi(kpi);
    setSendBackReason('');
    setSendBackTarget('manager');
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
      <WorkflowProgressTracker kpis={kpis || []} queries={queries || []} compact workflowStages={effectiveStages} />

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
              <CategoryScoreChart data={scoreData.categoryScores} />
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
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Pending</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-600">{pendingAuditCount}</p>
              </div>
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">In Audit</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-600">{inAuditCount}</p>
              </div>
              <FileCheck className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Forwarded</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">{forwardedCount}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            KPI Details - Audit Review
          </CardTitle>
          <CardDescription>Verify and validate KPI evaluations</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isMobile ? (
            <div className="space-y-3">
              {(kpis || []).map(kpi => {
                const submission = submissionMap.get(kpi.id);
                return (
                  <MobileKpiCard
                    key={kpi.id}
                    kpi={kpi}
                    submission={submission}
                    viewType="audit"
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
              {(!kpis || kpis.length === 0) && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No KPIs found for this period
                </p>
              )}
            </div>
          ) : (
            <KpiDetailsTable
              kpis={kpis || []}
              submissionMap={submissionMap}
              queryMap={queryMap as Map<string, KpiQuery[]>}
              viewType="audit"
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onReview={openReviewSheet}
              onView={openReviewSheet}
              onSendBack={openSendBackDialog}
              onShowLogic={(kpi) => { setSelectedKpi(kpi); setLogicModalOpen(true); }}
              expandedKpis={expandedDailyKpis}
              onToggleExpand={toggleDailyExpand}
              workflowStages={effectiveStages}
            />
          )}
        </CardContent>
      </Card>

      {/* Audit Review Sheet */}
      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="pb-3 sm:pb-4 border-b">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
              </div>
              <div>
                <SheetTitle className="text-base sm:text-lg">Audit Review</SheetTitle>
                <SheetDescription className="text-xs sm:text-sm">Verify and validate KPI evaluation</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-3 sm:space-y-4 py-3 sm:py-4">
            {/* KPI Review Panel */}
            {selectedKpi && (
              <KpiReviewPanel
                kpi={selectedKpi}
                submission={submissionMap.get(selectedKpi.id) || null}
                allKpis={allKpis || []}
                allSubmissions={allSubmissions || []}
                queries={queryMap.get(selectedKpi.id) || []}
                viewLevel="auditor"
                selectedPeriod={selectedPeriod}
                selectedYear={selectedYear}
                onOpenQueryHistory={() => setHistoryDialogOpen(true)}
                onOpenFullHistory={() => setTrackerModalOpen(true)}
                onOpenTimeline={() => setTimelineOpen(true)}
              />
            )}
            
            {/* N/A Confirmation Card */}
            {selectedKpi && submissionMap.get(selectedKpi.id)?.is_na && (
              <NaConfirmationCard
                selfRemarks={submissionMap.get(selectedKpi.id)?.self_remarks || null}
                confirmed={naConfirmed}
                onConfirmChange={setNaConfirmed}
                remarks={naRemarks}
                onRemarksChange={setNaRemarks}
                reviewerLevel="Auditor"
                naMarkedByRole={(submissionMap.get(selectedKpi.id) as any)?.na_marked_by_role || null}
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
                reviewerLevel="Auditor"
                canMarkNa
                reviewerMarkedNa={reviewerMarkNa}
                onReviewerMarkNa={setReviewerMarkNa}
                markNaRemarks={markNaRemarks}
                onMarkNaRemarksChange={setMarkNaRemarks}
              />
            )}
            
            {/* Daily Submission Summary with Override - for Daily Binary KPIs */}
            {selectedKpi && !reviewerMarkNa && (
              <DailySubmissionWithOverrideWrapper 
                kpi={selectedKpi} 
                selectedPeriod={selectedPeriod} 
                selectedYear={selectedYear}
                employee={employee}
                reviewerAgrees={auditorAgrees}
                onReviewerAgreesChange={setAuditorAgrees}
                dailyOverrides={dailyOverrides}
                onDailyOverridesChange={setDailyOverrides}
                overrideReason={overrideReason}
                onOverrideReasonChange={setOverrideReason}
                reviewerScore={auditorScore}
                onReviewerScoreChange={setAuditorScore}
                submissionMap={submissionMap}
                reviewLevel="auditor"
              />
            )}

            {/* Auditor Assessment - Only show for non-daily-binary or when agrees, and not when reviewer marked N/A */}
            {selectedKpi && !reviewerMarkNa && !(selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary') && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    Auditor Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AchievedValueScoreInput
                    kpi={selectedKpi}
                    achievedValue={auditorAchievedValue}
                    score={auditorScore}
                    onAchievedValueChange={setAuditorAchievedValue}
                    onScoreChange={(score, rating) => setAuditorScore(score)}
                    label="Auditor Assessment"
                    reviewMonth={selectedPeriod}
                    reviewYear={selectedYear}
                  />
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      placeholder="Add your audit comments..."
                      value={auditorRemarks}
                      onChange={(e) => setAuditorRemarks(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Evidence</Label>
                    <MultiFileUpload
                      userId={user?.id || ''}
                      contextId={selectedKpi?.id || ''}
                      folder="auditor-evidence"
                      existingUrls={auditorEvidenceUrls}
                      onUploadComplete={setAuditorEvidenceUrls}
                      label="Auditor Evidence"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Remarks for Daily Binary - shown separately */}
            {selectedKpi && !reviewerMarkNa && selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary' && auditorAgrees !== null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-500" />
                    Auditor Remarks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Remarks</Label>
                    <Textarea
                      placeholder="Add your audit comments..."
                      value={auditorRemarks}
                      onChange={(e) => setAuditorRemarks(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Evidence</Label>
                    <MultiFileUpload
                      userId={user?.id || ''}
                      contextId={selectedKpi?.id || ''}
                      folder="auditor-evidence"
                      existingUrls={auditorEvidenceUrls}
                      onUploadComplete={setAuditorEvidenceUrls}
                      label="Auditor Evidence"
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
                  setSendBackTarget('manager');
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
            {!submissionMap.get(selectedKpi?.id || '')?.is_na && !reviewerMarkNa && (
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => handleSubmitReview(false)}
                disabled={auditorScore === null || submitAuditReview.isPending}
              >
                Save Draft
              </Button>
            )}
            <Button
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
              onClick={() => handleSubmitReview(true)}
              disabled={
                reviewerMarkNa
                  ? !markNaRemarks.trim()
                  : submissionMap.get(selectedKpi?.id || '')?.is_na 
                    ? !naConfirmed 
                    : (auditorScore === null || submitAuditReview.isPending)
              }
            >
              <Check className="h-4 w-4 mr-2" />
              {reviewerMarkNa 
                ? 'Mark N/A & Forward'
                : submissionMap.get(selectedKpi?.id || '')?.is_na 
                  ? 'Confirm N/A & Forward' 
                  : 'Forward to Management'}
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
              <div className="flex gap-2">
                {(['manager', 'employee'] as const).map(target => (
                  <Button
                    key={target}
                    variant={sendBackTarget === target ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSendBackTarget(target)}
                    className="capitalize"
                  >
                    <User className="h-4 w-4 mr-1" />
                    {target}
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
  
  // Get the previous level's score based on review level
  const previousLevelScore = React.useMemo(() => {
    if (reviewLevel === 'auditor') return existingSubmission?.manager_score || null;
    if (reviewLevel === 'management') return existingSubmission?.auditor_score || existingSubmission?.manager_score || null;
    return existingSubmission?.self_score || null;
  }, [reviewLevel, existingSubmission]);
  
  const previousLevelRemarks = React.useMemo(() => {
    if (reviewLevel === 'auditor') return existingSubmission?.manager_remarks || null;
    if (reviewLevel === 'management') return existingSubmission?.auditor_remarks || existingSubmission?.manager_remarks || null;
    return existingSubmission?.self_remarks || null;
  }, [reviewLevel, existingSubmission]);
  
  // Calculate score when reviewer agrees or disagrees
  React.useEffect(() => {
    if (!isDailyBinary) return;
    
    if (reviewerAgrees === true) {
      // Accept previous level's score
      onReviewerScoreChange(previousLevelScore);
    } else if (reviewerAgrees === false && submissions) {
      // Recalculate with overrides
      const result = calculateOverriddenScore(submissions, dailyOverrides, selectedPeriod, selectedYear);
      onReviewerScoreChange(result.score);
    }
  }, [reviewerAgrees, dailyOverrides, submissions, previousLevelScore, isDailyBinary, selectedPeriod, selectedYear, onReviewerScoreChange]);
  
  if (kpi.frequency !== 'Daily' || !submissions || submissions.length === 0) {
    return null;
  }
  
  // Score label helper
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
  
  const levelLabel = reviewLevel === 'auditor' ? 'Auditor' : reviewLevel === 'management' ? 'Management' : 'Manager';
  
  return (
    <div className="space-y-4">
      {/* Daily Submission Summary (read-only) */}
      <DailySubmissionSummary
        kpiId={kpi.id}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        submissions={submissions}
        uom={kpi.uom}
        uomType={kpi.uom_type}
        qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
        kpiStatus={kpi.status}
        managerOverrides={dailyOverrides.size > 0 ? dailyOverrides : undefined}
      />
      
      {/* Agreement Toggle - Only for Daily Binary */}
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
          
          {/* Override Editor - shown when reviewer disagrees */}
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
          
          {/* Score Display - shown when reviewer has made a selection */}
          {reviewerAgrees !== null && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {reviewerAgrees === false ? `Recalculated ${levelLabel} Score` : `${levelLabel} Score (Accepted)`}
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

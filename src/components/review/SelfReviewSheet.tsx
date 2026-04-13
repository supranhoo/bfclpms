import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';
import { safeParseFloat } from '@/lib/utils';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitSelfReview, RatingLevel, KPI, OrgLevelScope, ReviewSubmission, useKpiQueries } from '@/hooks/useKpis';
import { useRespondToQuery } from '@/hooks/useQueryWorkflow';
import { useRemarksMandatorySettings, useOrgKpiSelfEntryAllowed } from '@/hooks/useWorkflowSettings';
import { useIsOrgKpiDataOwner, useOrgKpiOwners } from '@/hooks/useOrgKpiDataOwner';
import { useToast } from '@/hooks/use-toast';
import { useSubPeriodSubmissionsByKpis, useSubmitSubPeriod, SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useDailyAggregationMethod } from '@/hooks/useSystemSettings';
import { useCanRecallSubmission, useRecallSubmission } from '@/hooks/useRecallSubmission';
import { calculateDailyAggregatedScoreWithExpectedDays, getAggregationMethodLabel } from '@/lib/dailyAggregation';
import { useExpectedDays } from '@/hooks/useDailyAggregation';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { QualitativeOption, calculateQualitativeRating, scoreToRatingLevel } from '@/lib/qualitativeUom';
import {
  FrequencyType,
  requiresSubPeriodSelection,
  isKpiLockedForPeriod,
  isCycleComplete,
  hasMultiMonthCycle,
  getMonthNumber,
  getActiveMonthForCycle,
} from '@/lib/frequencyUtils';
import { useFrequencyConfig } from '@/hooks/useFrequencyConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KpiReviewPanel } from './KpiReviewPanel';
import { QueryHistoryDialog } from './QueryHistoryDialog';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';

import { SubPeriodSelector } from './SubPeriodSelector';
import { FrequencyLockedOverlay, FrequencyLockBadge } from './FrequencyLockedOverlay';
import { QualitativeValueInput } from './QualitativeValueInput';
import { DateCalendarInput } from './DateCalendarInput';
import { KpiTimeline } from '@/components/dashboard/KpiTimeline';
import { KpiTrackerModal } from '@/components/dashboard/KpiTrackerModal';
import { Target, TrendingUp, CheckCircle2, Send, Eye, AlertCircle, BarChart3, Building2, Lock, Users, User, FileCheck, Calendar, CalendarDays, AlertTriangle, Loader2, Undo2 } from 'lucide-react';
import { usePendingRollbackRequest } from '@/hooks/useKpiRollbackRequests';
import { RollbackRequestDialog } from '@/components/review/RollbackRequestDialog';
import { DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { SentBackBanner } from '@/components/review/SentBackBanner';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { format, endOfMonth } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending',
  self_review: 'Submitted',
  manager_check: 'Manager Review',
  audit: 'Audit',
  approved: 'Approved',
};

const scoreDisplay: Record<number, { label: string; color: string; level: RatingLevel }> = {
  5: { label: 'Outstanding', color: '#3B82F6', level: 'blue' },
  4: { label: 'Exceeds Expectations', color: '#10B981', level: 'green' },
  3: { label: 'Meets Expectations', color: '#F59E0B', level: 'yellow' },
  2: { label: 'Below Expectations', color: '#EF4444', level: 'red' },
  1: { label: 'Needs Improvement', color: '#DC2626', level: 'red' },
  0: { label: 'Not Achieved', color: '#991B1B', level: 'red' },
};

interface SelfReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpi: KPI | null;
  allKpis: KPI[];
  submissionMap: Map<string, ReviewSubmission>;
  allSubmissions: ReviewSubmission[];
  subPeriodSubmissions: SubPeriodSubmission[];
  subPeriodLoading: boolean;
  orgKpiValuesMap: Map<string, { achieved_value: number | null; data_source: string | null }>;
  selectedPeriod: string;
  selectedYear: number;
  /** If true, auto-open query history panel */
  autoOpenQueryHistory?: boolean;
}

export function SelfReviewSheet({
  open,
  onOpenChange,
  kpi: selectedKpi,
  allKpis,
  submissionMap,
  allSubmissions,
  subPeriodSubmissions,
  subPeriodLoading,
  orgKpiValuesMap,
  selectedPeriod,
  selectedYear,
  autoOpenQueryHistory = false,
}: SelfReviewSheetProps) {
  const { profile } = useAuth();
  const { method: dailyAggregationMethod } = useDailyAggregationMethod();
  const dayCountType = (selectedKpi?.day_count_type as 'working_days' | 'all_days') || 'working_days';
  const { expectedDays } = useExpectedDays(dayCountType, selectedPeriod, selectedYear, selectedKpi?.employee_id);
  const submitReview = useSubmitSelfReview();
  const submitSubPeriod = useSubmitSubPeriod();
  const { toast } = useToast();
  const remarksMandatory = useRemarksMandatorySettings();
  const orgKpiSelfEntryAllowed = useOrgKpiSelfEntryAllowed();

  // Rollback state
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const { data: pendingRollback } = usePendingRollbackRequest(selectedKpi?.id);
  const { data: employeeWorkflowStages, isLoading: stagesLoading } = useEmployeeWorkflowStages(profile?.id, selectedPeriod, selectedYear);
  const effectiveStages = employeeWorkflowStages || DEFAULT_WORKFLOW_STAGES;
  const { data: ownerCheck } = useIsOrgKpiDataOwner(
    selectedKpi?.category_id || '',
    selectedKpi?.kra_name || '',
    selectedKpi?.kpi_name || ''
  );
  const { data: orgKpiOwnersData } = useOrgKpiOwners(
    selectedKpi?.category_id || '',
    selectedKpi?.kra_name || '',
    selectedKpi?.kpi_name || ''
  );

  const orgKpiOwnerNames = useMemo(() =>
    (orgKpiOwnersData || []).map(o => o.owner?.full_name || o.owner?.email || 'Unknown').filter(Boolean),
    [orgKpiOwnersData]
  );

  // Frequency lock state
  const { config: frequencyConfig } = useFrequencyConfig(selectedKpi?.frequency);
  const isFrequencyLocked = selectedKpi ? isKpiLockedForPeriod(
    selectedKpi.frequency, selectedPeriod, selectedYear,
    selectedKpi.frequency_cycle_start, frequencyConfig
  ) : false;

  // Cycle completion gate: terminal month must have ended before review is allowed
  const isCycleIncomplete = selectedKpi ? !isCycleComplete(
    selectedKpi.frequency, selectedPeriod, selectedYear,
    selectedKpi.frequency_cycle_start, frequencyConfig
  ) : false;

  // Combined lock: either sibling month or cycle not yet complete
  const isMultiMonthBlocked = isFrequencyLocked || isCycleIncomplete;

  // Month-end gate: prevent premature Submit Month for Daily/Weekly KPIs
  const isMonthStillActive = useMemo(() => {
    const monthNum = getMonthNumber(selectedPeriod);
    const monthEnd = endOfMonth(new Date(selectedYear, monthNum - 1));
    return new Date() <= monthEnd;
  }, [selectedPeriod, selectedYear]);

  // Form state
  const [achievedValue, setAchievedValue] = useState('');
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);
  const [calculatedPercentage, setCalculatedPercentage] = useState<number | null>(null);
  const [calculatedRatingLevel, setCalculatedRatingLevel] = useState<RatingLevel | null>(null);
  const [selfRemarks, setSelfRemarks] = useState('');
  const [selfEvidenceUrls, setSelfEvidenceUrls] = useState<string[]>([]);
  const [isNa, setIsNa] = useState(false);
  const [selectedSubPeriod, setSelectedSubPeriod] = useState<string | null>(null);

  // Confirmation dialogs
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);
  const [resubmitReason, setResubmitReason] = useState('');
  const [pendingResubmitReason, setPendingResubmitReason] = useState('');
  const [showMonthlySubmitConfirm, setShowMonthlySubmitConfirm] = useState(false);
  const [isSubmittingMonthly, setIsSubmittingMonthly] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);

  // Sub-panels
  const [queryHistoryOpen, setQueryHistoryOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);

  // Recall submission
  const { data: recallEligibility } = useCanRecallSubmission(selectedKpi?.id, selectedKpi?.status, selectedKpi?.employee_id);
  const recallMutation = useRecallSubmission();

  // Inline query response state
  const kpiIdsForQueries = useMemo(() => selectedKpi ? [selectedKpi.id] : [], [selectedKpi]);
  const { data: openQueries } = useKpiQueries(kpiIdsForQueries);
  const respondToQuery = useRespondToQuery();
  const [queryResponseText, setQueryResponseText] = useState('');
  const [queryResponseEvidence, setQueryResponseEvidence] = useState('');
  const [respondingToQueryId, setRespondingToQueryId] = useState<string | null>(null);

  const myOpenQueries = useMemo(() => {
    if (!openQueries || !profile?.id) return [];
    return openQueries.filter(q => q.raised_to === profile.id && q.status === 'open');
  }, [openQueries, profile?.id]);

  // Auto-open query history if requested
  useEffect(() => {
    if (autoOpenQueryHistory && selectedKpi && open) {
      setQueryHistoryOpen(true);
    }
  }, [autoOpenQueryHistory, selectedKpi, open]);

  const isQualitativeKpi = (kpi: KPI | null): boolean => {
    return kpi?.uom_type === 'binary' || kpi?.uom_type === 'tiered';
  };

  // Sub-period submissions for selected KPI
  const selectedKpiSubPeriods = useMemo(() => {
    return selectedKpi ? subPeriodSubmissions?.filter(s => s.kpi_id === selectedKpi.id) || [] : [];
  }, [selectedKpi, subPeriodSubmissions]);

  const aggregatedSubPeriodResult = useMemo(() => {
    if (selectedKpiSubPeriods.length === 0) return null;
    const values = selectedKpiSubPeriods
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);
    const isBinaryKpi = selectedKpi?.uom_type === 'binary';
    return calculateDailyAggregatedScoreWithExpectedDays(values, dailyAggregationMethod, expectedDays, isBinaryKpi);
  }, [selectedKpiSubPeriods, dailyAggregationMethod, expectedDays, selectedKpi]);

  const aggregatedSubPeriodScore = aggregatedSubPeriodResult?.score ?? null;

  // Score calculation
  const calculateScoreFromAchieved = useCallback((achieved: number, kpi: KPI) => {
    const thresholds: RatingThresholds = {
      r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0
    };
    const uomType = kpi.uom_type || 'numeric';
    const isQualitative = uomType === 'binary' || uomType === 'tiered';

    if (isQualitative && (kpi.frequency === 'Daily' || kpi.frequency === 'Weekly')) {
      const rating = Math.min(5, Math.max(0, Math.round(achieved)));
      const ratingLevel = rating >= 4 ? 'blue' : rating >= 3 ? 'green' : rating >= 2 ? 'yellow' : 'red';
      return {
        rating,
        ratingLevel: ratingLevel as 'blue' | 'green' | 'yellow' | 'red',
        weightedScore: (kpi.weightage || 0) * rating,
        percentage: (rating / 5) * 100,
        achievedWeight: rating / 5,
      };
    }

    return calculateRating(
      achieved, kpi.target_value, thresholds,
      kpi.criteria || 'Higher is Better', kpi.weightage || 0,
      uomType, kpi.qualitative_options as QualitativeOption[] | null,
      kpi.uom, kpi.threshold_mode || 'absolute'
    );
  }, []);

  // Ref to prevent re-initialization when submissionMap changes (e.g. Chrome tab switch)
  const lastInitializedRef = useRef<string | null>(null);

  // Initialize form when KPI changes
  useEffect(() => {
    if (!selectedKpi || !open) {
      lastInitializedRef.current = null;
      return;
    }

    // Skip re-initialization if already initialized for this KPI
    if (lastInitializedRef.current === selectedKpi.id) return;
    lastInitializedRef.current = selectedKpi.id;

    const existing = submissionMap.get(selectedKpi.id);
    setSelectedSubPeriod(null);
    setResubmitReason('');
    setPendingResubmitReason('');

    const needsSubPeriod = requiresSubPeriodSelection(selectedKpi.frequency as FrequencyType);

    if (!needsSubPeriod) {
      // Get org value
      const scope = selectedKpi.org_level_scope || 'employee';
      let orgKey: string;
      if (scope === 'organization') {
        orgKey = `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||null||null`;
      } else if (scope === 'department') {
        const deptId = profile?.department_id || 'null';
        orgKey = `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||${deptId}||null`;
      } else {
        const empId = profile?.id || 'null';
        orgKey = `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||null||${empId}`;
      }
      const orgValue = selectedKpi.is_org_level ? orgKpiValuesMap.get(orgKey) || null : null;
      const prefilledValue = orgValue?.achieved_value ?? existing?.achieved_value;

      if (prefilledValue !== null && prefilledValue !== undefined) {
        if (isQualitativeKpi(selectedKpi)) {
          const options = selectedKpi.uom_type === 'binary'
            ? ((selectedKpi.qualitative_options as QualitativeOption[] | null)?.length ? (selectedKpi.qualitative_options as QualitativeOption[]) : [{ label: 'Yes', rating: 5 }, { label: 'No', rating: 0 }])
            : (selectedKpi.qualitative_options as QualitativeOption[] | null) || [];
          const matchedOption = options.find(o =>
            o.label === prefilledValue.toString() || o.rating === prefilledValue
          );
          if (matchedOption) {
            setAchievedValue(matchedOption.label);
            setCalculatedScore(matchedOption.rating);
            setCalculatedRatingLevel(scoreToRatingLevel(matchedOption.rating) as RatingLevel);
            setCalculatedPercentage(null);
          } else {
            setAchievedValue(''); setCalculatedScore(null); setCalculatedRatingLevel(null); setCalculatedPercentage(null);
          }
        } else {
          setAchievedValue(prefilledValue.toString());
          const result = calculateScoreFromAchieved(prefilledValue, selectedKpi);
          setCalculatedScore(result.rating);
          setCalculatedPercentage(result.percentage);
          setCalculatedRatingLevel(null);
        }
      } else {
        setAchievedValue(''); setCalculatedScore(null); setCalculatedPercentage(null); setCalculatedRatingLevel(null);
      }
    } else {
      setAchievedValue(''); setCalculatedScore(null); setCalculatedPercentage(null); setCalculatedRatingLevel(null);
    }

    setSelfRemarks(existing?.self_remarks || '');
    const existingUrls = (existing as any)?.self_evidence_urls;
    setSelfEvidenceUrls(Array.isArray(existingUrls) && existingUrls.length > 0
      ? existingUrls
      : existing?.self_evidence_url ? [existing.self_evidence_url] : []);
    setIsNa(existing?.is_na || false);
  }, [selectedKpi, open, submissionMap, orgKpiValuesMap, profile, calculateScoreFromAchieved]);

  const handleAchievedChange = (value: string) => {
    setAchievedValue(value);
    if (selectedKpi && value) {
      const result = calculateScoreFromAchieved(parseFloat(value), selectedKpi);
      setCalculatedScore(result.rating);
      setCalculatedPercentage(result.percentage);
      setCalculatedRatingLevel(null);
    } else {
      setCalculatedScore(null); setCalculatedPercentage(null); setCalculatedRatingLevel(null);
    }
  };

  const handleQualitativeChange = (value: string, rating: number, ratingLevel: RatingLevel) => {
    setAchievedValue(value);
    setCalculatedScore(rating);
    setCalculatedRatingLevel(ratingLevel);
    setCalculatedPercentage(null);
  };

  const handleSubPeriodChange = (value: string) => {
    setSelectedSubPeriod(value);
    setResubmitReason('');
    if (selectedKpi) {
      const existingSubPeriod = subPeriodSubmissions?.find(
        s => s.kpi_id === selectedKpi.id && s.sub_period_value === value
      );
      if (existingSubPeriod?.achieved_value !== null && existingSubPeriod?.achieved_value !== undefined) {
        setAchievedValue(existingSubPeriod.achieved_value.toString());
        const result = calculateScoreFromAchieved(existingSubPeriod.achieved_value, selectedKpi);
        setCalculatedScore(result.rating); setCalculatedPercentage(result.percentage);
        setSelfRemarks(existingSubPeriod.remarks || '');
      } else {
        setAchievedValue(''); setCalculatedScore(null); setCalculatedPercentage(null); setSelfRemarks('');
      }
    }
  };

  const getCurrentSubPeriodSubmission = (): SubPeriodSubmission | undefined => {
    if (!selectedKpi || !selectedSubPeriod) return undefined;
    return subPeriodSubmissions?.find(
      s => s.kpi_id === selectedKpi.id && s.sub_period_value === selectedSubPeriod
    );
  };

  // Use canonical scoreToRatingLevel from qualitativeUom (already imported on line 16)

  const handleSubmitMonthlyReview = async () => {
    if (!selectedKpi) return;

    // Validate mandatory remarks for self review (monthly submit)
    if (remarksMandatory.self && !selfRemarks.trim()) {
      toast({ title: 'Remarks Required', description: 'Remarks are required for Self Review', variant: 'destructive' });
      return;
    }

    const values = selectedKpiSubPeriods
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);
    const isBinaryKpi = selectedKpi?.uom_type === 'binary';
    const aggregationResult = calculateDailyAggregatedScoreWithExpectedDays(values, dailyAggregationMethod, expectedDays, isBinaryKpi);
    const aggregatedScore = aggregationResult.score;

    // Allow submission with 0 score when no daily data was captured
    const effectiveScore = aggregatedScore ?? 0;
    const hasNoEntries = aggregatedScore === null;

    setIsSubmittingMonthly(true);
    try {
      // For missed_days_penalty, the aggregated score IS the rating (0-5) — do NOT re-map through thresholds
      const isDailyWeekly = selectedKpi.frequency === 'Daily' || selectedKpi.frequency === 'Weekly';
      const isMissedDaysPenalty = dailyAggregationMethod === 'missed_days_penalty';
      
      let finalRating: number;
      let selfRating: RatingLevel;
      if (isDailyWeekly && isMissedDaysPenalty) {
        finalRating = Math.min(5, Math.max(0, Math.round(effectiveScore)));
        selfRating = scoreToRatingLevel(finalRating);
      } else {
        const result = calculateScoreFromAchieved(effectiveScore, selectedKpi);
        finalRating = result.rating;
        selfRating = scoreToRatingLevel(result.rating);
      }
      
      let defaultRemarks: string;
      if (hasNoEntries) {
        const totalDays = aggregationResult.totalDays;
        defaultRemarks = `Missed Days Penalty: 0 of ${totalDays} days submitted — Score 0`;
      } else {
        const methodLabel = dailyAggregationMethod === 'missed_days_penalty'
          ? `Missed Days Penalty (${aggregationResult.missedDays} missed)`
          : 'Average';
        defaultRemarks = `${methodLabel}: Aggregated from ${selectedKpiSubPeriods.length} ${selectedKpi.frequency?.toLowerCase()} entries`;
      }

      await submitReview.mutateAsync({
        kpi_id: selectedKpi.id,
        achieved_value: effectiveScore,
        self_rating: selfRating,
        self_score: finalRating,
        self_remarks: selfRemarks || defaultRemarks,
        self_evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
        self_evidence_urls: selfEvidenceUrls,
        is_na: false,
      });

      setShowMonthlySubmitConfirm(false);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Monthly Submission Failed',
        description: error?.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingMonthly(false);
    }
  };

  const handleConfirmResubmit = () => {
    if (pendingResubmitReason.trim()) {
      setResubmitReason(pendingResubmitReason.trim());
      setShowResubmitConfirm(false);
      setPendingResubmitReason('');
      performSubPeriodSubmit(pendingResubmitReason.trim(), true);
    }
  };

  const performSubPeriodSubmit = async (updateReason: string | null, isResubmission: boolean) => {
    if (!selectedKpi || !selectedSubPeriod) return;
    await submitSubPeriod.mutateAsync({
      kpi_id: selectedKpi.id,
      sub_period_type: selectedKpi.frequency === 'Daily' ? 'daily' : 'weekly',
      sub_period_value: selectedSubPeriod,
      achieved_value: isNa ? null : (isQualitativeKpi(selectedKpi) ? calculatedScore : safeParseFloat(achievedValue)),
      remarks: selfRemarks || null,
      evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
      evidence_urls: selfEvidenceUrls,
      review_month: selectedPeriod,
      review_year: selectedYear,
      update_reason: updateReason,
      is_resubmission: isResubmission,
    });
    setSelectedSubPeriod(null); setAchievedValue(''); setCalculatedScore(null); setSelfRemarks(''); setResubmitReason(''); setSelfEvidenceUrls([]);
  };

  const handleSubmitReview = async () => {
    if (!selectedKpi) return;
    const needsSubPeriod = requiresSubPeriodSelection(selectedKpi.frequency as FrequencyType);

    if (needsSubPeriod && selectedSubPeriod) {
      const existingSubmission = getCurrentSubPeriodSubmission();
      const isExistingSubmission = !!existingSubmission;
      const isAlreadyResubmitted = existingSubmission?.is_resubmitted || false;
      const requiresReason = selectedKpi.require_resubmit_reason !== false;
      if (isAlreadyResubmitted) return;
      if (isExistingSubmission && requiresReason) { setShowResubmitConfirm(true); return; }
      await performSubPeriodSubmit(null, isExistingSubmission);
      return;
    }

    if (!isNa && !achievedValue) return;

    // Validate mandatory remarks for self review
    if (remarksMandatory.self && !selfRemarks.trim()) {
      toast({ title: 'Remarks Required', description: 'Remarks are required for Self Review', variant: 'destructive' });
      return;
    }

    const selfRating = isNa
      ? null
      : isQualitativeKpi(selectedKpi)
        ? calculatedRatingLevel
        : (calculatedScore !== null ? scoreToRatingLevel(calculatedScore) : null);

    try {
      await submitReview.mutateAsync({
        kpi_id: selectedKpi.id,
        achieved_value: isNa ? null : (isQualitativeKpi(selectedKpi) ? calculatedScore : (safeParseFloat(achievedValue) ?? 0)),
        self_rating: selfRating,
        self_score: isNa ? null : calculatedScore,
        self_remarks: selfRemarks,
        self_evidence_url: selfEvidenceUrls.length > 0 ? selfEvidenceUrls[0] : null,
        self_evidence_urls: selfEvidenceUrls,
        is_na: isNa,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Submission Failed',
        description: error?.message || 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Governance permissions — must be called before any early return to satisfy Rules of Hooks
  const govPerms = useReviewPeriodPermissions(selectedPeriod, selectedYear);

  if (!selectedKpi) return null;

  // Compute state
  const isSelectedKpiOrgLevel = selectedKpi?.is_org_level || false;
  const orgKey = (() => {
    const scope = selectedKpi.org_level_scope || 'employee';
    if (scope === 'organization') return `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||null||null`;
    if (scope === 'department') {
      const deptId = profile?.department_id || 'null';
      return `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||${deptId}||null`;
    }
    const empId = profile?.id || 'null';
    return `${selectedKpi.category_id}||${selectedKpi.kra_name.toLowerCase()}||${selectedKpi.kpi_name.toLowerCase()}||null||${empId}`;
  })();
  const selectedKpiOrgValue = isSelectedKpiOrgLevel ? orgKpiValuesMap.get(orgKey) || null : null;
  const hasOrgData = isSelectedKpiOrgLevel && selectedKpiOrgValue?.achieved_value != null;
  const isOrgLocked = isSelectedKpiOrgLevel && !orgKpiSelfEntryAllowed && !ownerCheck?.canEdit;
  const isKraSet = selectedKpi?.status === 'kra_set';
  const needsSubPeriodForKpi = selectedKpi ? requiresSubPeriodSelection(selectedKpi.frequency as FrequencyType) : false;
  const isSelfReview = selectedKpi?.status === 'self_review';

  // Detect sent-back KPI: status reverted to kra_set but a prior submission exists
  const isSentBack = isKraSet && selectedKpi && submissionMap.has(selectedKpi.id);

  // Daily KPIs need continuous data entry — bypass governance lock at kra_set
  const isDailyUnlocked = isKraSet && selectedKpi?.frequency?.toLowerCase() === 'daily';

  // Governance lock does NOT apply to sent-back or daily-frequency KPIs
  const isGovernanceLocked = !isSentBack && !isDailyUnlocked && (!govPerms.submit_self_review || govPerms.view_only);

  const isReadOnly = (!isKraSet && !isSelfReview) || isGovernanceLocked;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col h-full w-full sm:w-[85vw] sm:max-w-[1200px] overflow-y-auto p-4 sm:p-6">
          {/* Header */}
          <SheetHeader className="pb-2 sm:pb-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-base sm:text-lg">
                  {isReadOnly ? 'View KPI Details' : (isSelfReview ? 'Edit Self Review' : 'Submit Self Review')}
                </SheetTitle>
                {isReadOnly && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1 text-xs">
                    <Eye className="h-3 w-3" />
                    Read Only
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <FrequencyLockBadge
                  frequency={selectedKpi?.frequency}
                  reviewMonth={selectedPeriod}
                  reviewYear={selectedYear}
                  frequencyCycleStart={selectedKpi?.frequency_cycle_start}
                />
                <Badge className={`${statusColors[selectedKpi?.status || 'kra_set']} text-xs`}>
                  {statusLabels[selectedKpi?.status || 'kra_set']}
                </Badge>
              </div>
            </div>
          </SheetHeader>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto py-3 sm:py-4 space-y-4 sm:space-y-6">
            {/* Sent-back info banner with reason */}
            {isSentBack && (
              <SentBackBanner kpiId={selectedKpi.id} />
            )}
            {/* Daily KPI governance bypass banner */}
            {isDailyUnlocked && !isSentBack && (!govPerms.submit_self_review || govPerms.view_only) && (
              <div className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950 p-3 text-sm text-blue-800 dark:text-blue-200">
                <CalendarDays className="h-4 w-4 flex-shrink-0" />
                <span>Daily data entry is permitted for this KPI even during restricted review periods.</span>
              </div>
            )}
            {/* KPI Review Panel */}
            <KpiReviewPanel
              kpi={selectedKpi}
              submission={submissionMap.get(selectedKpi.id) || null}
              allKpis={allKpis}
              allSubmissions={allSubmissions}
              viewLevel="employee"
              currentUserId={profile?.id}
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onOpenQueryHistory={() => setQueryHistoryOpen(true)}
              onOpenFullHistory={() => setTrackerModalOpen(true)}
              onOpenTimeline={() => setTimelineOpen(true)}
              workflowStages={effectiveStages}
            />

            {/* Inline Query Response Section */}
            {myOpenQueries.length > 0 && (
              <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Open Queries ({myOpenQueries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {myOpenQueries.map(q => (
                    <div key={q.id} className="p-3 border rounded-lg bg-background space-y-2">
                      <p className="text-sm font-medium">Query: {q.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        Raised on {new Date(q.created_at).toLocaleDateString()}
                      </p>
                      {respondingToQueryId === q.id ? (
                        <div className="space-y-2 pt-2 border-t">
                          <Textarea
                            value={queryResponseText}
                            onChange={(e) => setQueryResponseText(e.target.value)}
                            placeholder="Type your response..."
                            rows={2}
                            className="text-sm"
                            autoFocus
                          />
                          {profile?.id && selectedKpi && (
                            <EvidenceUpload
                              userId={profile.id}
                              kpiId={selectedKpi.id}
                              existingUrl={queryResponseEvidence || null}
                              onUploadComplete={setQueryResponseEvidence}
                            />
                          )}
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRespondingToQueryId(null);
                                setQueryResponseText('');
                                setQueryResponseEvidence('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={!queryResponseText.trim() || respondToQuery.isPending}
                              onClick={() => {
                                respondToQuery.mutate({
                                  query_id: q.id,
                                  kpi_id: q.kpi_id,
                                  resolution_notes: queryResponseText,
                                  resolution_evidence_url: queryResponseEvidence || undefined,
                                }, {
                                  onSuccess: () => {
                                    setRespondingToQueryId(null);
                                    setQueryResponseText('');
                                    setQueryResponseEvidence('');
                                  },
                                });
                              }}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              {respondToQuery.isPending ? 'Sending...' : 'Submit Response'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => {
                            setRespondingToQueryId(q.id);
                            setQueryResponseText('');
                            setQueryResponseEvidence('');
                          }}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Respond
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}


            {selectedKpi?.frequency === 'Daily' && selectedKpiSubPeriods.length > 0 && (
              <DailySubmissionSummary
                kpiId={selectedKpi.id}
                reviewMonth={selectedPeriod}
                reviewYear={selectedYear}
                submissions={selectedKpiSubPeriods}
                uom={selectedKpi.uom}
                uomType={selectedKpi.uom_type}
                qualitativeOptions={selectedKpi.qualitative_options as QualitativeOption[] | null}
                kpiStatus={selectedKpi.status}
              />
            )}

            {/* Self Assessment Form - Only in edit mode */}
            {!isReadOnly && selectedKpi && (
              <>
              {/* Frequency Lock */}
              {isKraSet && isMultiMonthBlocked ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-muted">
                        <Lock className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-foreground">
                      {isFrequencyLocked ? 'Entry not allowed yet' : 'Cycle in progress'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isFrequencyLocked ? (
                        <>
                          This <strong>{selectedKpi.frequency}</strong> KPI is locked for{' '}
                          <strong>{selectedPeriod}</strong>.{' '}
                          Data entry opens in the active review month of the cycle.
                        </>
                      ) : (
                        <>
                          This <strong>{selectedKpi.frequency}</strong> KPI for{' '}
                          <strong>{selectedPeriod} {selectedYear}</strong> can be reviewed after the cycle ends.{' '}
                          Please wait until <strong>{selectedPeriod}</strong> is complete.
                        </>
                      )}
                    </p>
                    {isFrequencyLocked && (
                      <p className="text-xs text-muted-foreground">
                        For Quarterly KPIs (Jan–Mar), entry opens in <strong>March</strong>.
                        For Bi-Monthly KPIs (Feb–Mar), entry opens in <strong>March</strong>.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : isOrgLocked ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-muted">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </div>
                    <h3 className="font-semibold text-foreground">Organization KPI</h3>

                    {/* Status badge */}
                    {(() => {
                      const val = selectedKpiOrgValue;
                      if (hasOrgData && selectedKpi?.status && ['manager_review','reviewer_review','final','completed'].includes(selectedKpi.status)) {
                        return (
                          <Badge className="bg-green-600/15 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
                            ✓ Propagated — Value: {val?.achieved_value}
                          </Badge>
                        );
                      }
                      if (hasOrgData) {
                        return (
                          <Badge className="bg-blue-600/15 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                            Data entered — awaiting propagation
                          </Badge>
                        );
                      }
                      return (
                        <Badge className="bg-amber-600/15 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">
                          Pending — awaiting data entry
                        </Badge>
                      );
                    })()}

                    {/* Data Owner names */}
                    {orgKpiOwnerNames && orgKpiOwnerNames.length > 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Assigned to: <span className="font-medium text-foreground">{orgKpiOwnerNames.join(', ')}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No Data Owner assigned yet.
                      </p>
                    )}

                    <Badge variant="outline" className="mt-2">
                      <Lock className="h-3 w-3 mr-1" />
                      Self-entry disabled
                    </Badge>
                  </CardContent>
                </Card>
              ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileCheck className="h-4 w-4" />
                    Your Assessment
                  </CardTitle>
                  <CardDescription>
                    Enter your achieved value and provide justification
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                  {needsSubPeriodForKpi && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="font-medium text-purple-800 dark:text-purple-200">
                            {selectedKpi.frequency} KPI
                          </span>
                          <span className="text-purple-600 dark:text-purple-400">
                            - Submit data for each {selectedKpi.frequency === 'Daily' ? 'day' : 'week'}
                          </span>
                        </div>
                        {selectedKpiSubPeriods.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedKpiSubPeriods.length} entries | Avg: {aggregatedSubPeriodScore?.toFixed(1) ?? '—'}
                          </Badge>
                        )}
                      </div>
                      <SubPeriodSelector
                        frequency={selectedKpi.frequency as FrequencyType}
                        reviewMonth={selectedPeriod}
                        reviewYear={selectedYear}
                        selectedSubPeriod={selectedSubPeriod}
                        onSubPeriodChange={handleSubPeriodChange}
                        submissions={selectedKpiSubPeriods}
                      />
                    </div>
                  )}

                  {/* N/A Toggle */}
                  <div className="flex items-center space-x-2 p-2 border rounded-lg bg-muted/30">
                    <Checkbox
                      id="is_na"
                      checked={isNa}
                      onCheckedChange={(checked) => {
                        setIsNa(checked as boolean);
                        if (checked) {
                          setAchievedValue(''); setCalculatedScore(null); setCalculatedPercentage(null);
                        }
                      }}
                      disabled={hasOrgData}
                    />
                    <Label htmlFor="is_na" className="cursor-pointer text-sm">
                      Mark as N/A (Not Applicable)
                      {hasOrgData && <span className="text-muted-foreground ml-1">(disabled for org data)</span>}
                    </Label>
                  </div>

                  {/* Input Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!isNa && (
                      <div className="space-y-2">
                        {selectedKpi?.uom === 'Date' ? (
                          <DateCalendarInput
                            value={achievedValue ? parseInt(achievedValue) : null}
                            onChange={(day) => handleAchievedChange(day?.toString() || '')}
                            reviewMonth={selectedPeriod}
                            reviewYear={selectedYear}
                            disabled={hasOrgData}
                            label="Completion Date *"
                          />
                        ) : isQualitativeKpi(selectedKpi) ? (
                          <QualitativeValueInput
                            uomType={selectedKpi?.uom_type as 'binary' | 'tiered'}
                            qualitativeOptions={selectedKpi?.qualitative_options as QualitativeOption[] | null}
                            value={achievedValue || null}
                            onChange={handleQualitativeChange}
                            disabled={hasOrgData}
                            label="Achieved Value *"
                          />
                        ) : (
                          <>
                            <Label htmlFor="achieved" className="text-sm flex items-center gap-2">
                              Achieved Value *
                              {hasOrgData && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Lock className="h-3 w-3 text-muted-foreground" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Verified organization data{selectedKpiOrgValue?.data_source && ` from ${selectedKpiOrgValue.data_source}`}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </Label>
                            <Input
                              id="achieved"
                              type="number"
                              value={achievedValue}
                              onChange={(e) => handleAchievedChange(e.target.value)}
                              placeholder="Enter value"
                              className={hasOrgData ? 'bg-muted cursor-not-allowed' : ''}
                              readOnly={hasOrgData}
                              disabled={hasOrgData}
                            />
                            {hasOrgData && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                Verified data - cannot be modified
                              </p>
                            )}
                            {!hasOrgData && achievedValue && selectedKpi?.target_value && (
                              <p className="text-xs text-muted-foreground">
                                {((parseFloat(achievedValue) / selectedKpi.target_value) * 100).toFixed(1)}% of target
                              </p>
                            )}
                          </>
                        )}

                        {/* Calculated Rating Display */}
                        {!isNa && calculatedScore !== null && !isQualitativeKpi(selectedKpi) && (
                          <div className="p-3 border rounded-lg bg-muted/50">
                            <Label className="text-xs text-muted-foreground">Calculated Rating</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                style={{ backgroundColor: scoreDisplay[calculatedScore]?.color || '#991B1B' }}
                                className="text-white px-2 py-0.5"
                              >
                                {calculatedScore}
                              </Badge>
                              <span className="text-sm font-medium">{scoreDisplay[calculatedScore]?.label || 'Not Achieved'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remarks */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="remarks" className="text-sm">
                          {isNa ? 'Reason for N/A *' : <>Justification{remarksMandatory.self && <span className="text-destructive ml-1">*</span>}</>}
                        </Label>
                        {isNa && (
                          <span className={`text-xs ${selfRemarks.trim().length < 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {selfRemarks.trim().length}/50 min
                          </span>
                        )}
                      </div>
                      <Textarea
                        id="remarks"
                        value={selfRemarks}
                        onChange={(e) => setSelfRemarks(e.target.value)}
                        placeholder={isNa ? 'Explain why this KPI is not applicable (minimum 50 characters)...' : 'Describe your achievements...'}
                        className={`resize-none min-h-[80px] ${isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 ? 'border-destructive' : ''}`}
                      />
                      {isNa && selfRemarks.trim().length < 50 && selfRemarks.length > 0 && (
                        <p className="text-xs text-destructive">
                          {50 - selfRemarks.trim().length} more characters needed
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Evidence Upload */}
                  {profile?.id && selectedKpi && (
                    <MultiFileUpload
                      userId={profile.id}
                      contextId={selectedKpi.id}
                      folder="self-evidence"
                      existingUrls={selfEvidenceUrls}
                      onUploadComplete={setSelfEvidenceUrls}
                      label="Evidence Attachments"
                    />
                  )}

                  {isNa && (
                    <div className="p-3 border rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        This KPI will be excluded from overall score calculations.
                      </p>
                    </div>
                  )}
                  </div>{/* end relative wrapper */}
                </CardContent>
              </Card>
              )}
              </>
            )}


            {/* Read-Only View of Submitted Data */}
            {isReadOnly && selectedKpi && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Submitted Data
                  </CardTitle>
                  <CardDescription>
                    Your submission is currently at "{statusLabels[selectedKpi?.status || 'self_review']}" stage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selfRemarks && (
                    <div>
                      <Label className="text-sm mb-2 block">Justification</Label>
                      <div className="p-3 bg-muted/50 rounded-lg text-sm">{selfRemarks}</div>
                    </div>
                  )}
                  {selfEvidenceUrls.length > 0 && (
                    <div>
                      <Label className="text-sm mb-2 block">Evidence</Label>
                      {selfEvidenceUrls.map((url, idx) => (
                        <button key={idx} type="button" onClick={() => openStorageFile(url, buildEvidenceFileName(url, selectedKpi?.kpi_name, 'Self', idx, selfEvidenceUrls.length))}
                          className="text-sm text-primary underline hover:no-underline block bg-transparent border-none p-0 cursor-pointer text-left">
                          View Evidence {selfEvidenceUrls.length > 1 ? idx + 1 : ''}
                        </button>
                      ))}
                    </div>
                  )}
                
                </CardContent>
              </Card>
            )}
          </div>

          {/* Footer */}
          <SheetFooter className="pt-3 border-t flex-shrink-0">
            <div className="flex items-center gap-2 w-full justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  {isReadOnly ? 'Close' : (needsSubPeriodForKpi ? 'Done' : 'Cancel')}
                </Button>
                {/* Request Rollback button - shown when KPI is submitted (read-only) and not approved, and no pending request */}
                {isReadOnly && selectedKpi?.status !== 'approved' && !pendingRollback && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                    onClick={() => setRollbackDialogOpen(true)}
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    Request Rollback
                  </Button>
                )}
                {isReadOnly && pendingRollback && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Rollback requested
                  </span>
                )}
                {/* Recall Submission button - shown when KPI is self_review and recall is eligible */}
                {isSelfReview && recallEligibility?.canRecall && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950"
                    onClick={() => setShowRecallConfirm(true)}
                    disabled={recallMutation.isPending}
                  >
                    <Undo2 className="h-3 w-3 mr-1" />
                    {recallMutation.isPending ? 'Recalling...' : (() => {
                      if (!recallEligibility.remainingMs) return 'Recall';
                      const totalMin = Math.floor(recallEligibility.remainingMs / 60000);
                      const h = Math.floor(totalMin / 60);
                      const m = totalMin % 60;
                      return `Recall (${h > 0 ? `${h}h ` : ''}${m}m left)`;
                    })()}
                  </Button>
                )}
              </div>

              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const currentSubPeriodSubmission = needsSubPeriodForKpi && selectedSubPeriod && selectedKpi
                      ? subPeriodSubmissions?.find(s => s.kpi_id === selectedKpi.id && s.sub_period_value === selectedSubPeriod)
                      : null;
                    const isSubPeriodFinal = currentSubPeriodSubmission?.is_resubmitted || false;

                    if (isSubPeriodFinal) {
                      return (
                        <Badge className="gap-1 bg-green-600 hover:bg-green-600 h-9 px-4">
                          <Lock className="h-3 w-3" />
                          Final - No Further Edits
                        </Badge>
                      );
                    }

                    return (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleSubmitReview}
                        disabled={
                          isMultiMonthBlocked ||
                          (needsSubPeriodForKpi && (!selectedSubPeriod || (!isNa && !achievedValue))) ||
                          (!needsSubPeriodForKpi && !isNa && !achievedValue) ||
                          (isNa && selfRemarks.trim().length < 50) ||
                          submitReview.isPending || submitSubPeriod.isPending
                        }
                      >
                        {(submitReview.isPending || submitSubPeriod.isPending)
                          ? 'Saving...'
                          : needsSubPeriodForKpi
                            ? (currentSubPeriodSubmission ? 'Update Entry' : 'Save Entry')
                            : (isSelfReview ? 'Update' : 'Submit')}
                      </Button>
                    );
                  })()}

                  {/* Submit Month Button */}
                  {needsSubPeriodForKpi && (
                    <>
                      {subPeriodLoading ? (
                        <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading...
                        </Button>
                      ) : selectedKpiSubPeriods.length === 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                <Send className="h-3 w-3" />
                                Submit Month
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Enter at least one {selectedKpi?.frequency?.toLowerCase()} value first
                          </TooltipContent>
                        </Tooltip>
                      ) : selectedKpi?.status !== 'kra_set' ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                <Send className="h-3 w-3" />
                                Month Submitted
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            This KPI has already been submitted for the month
                          </TooltipContent>
                        </Tooltip>
                      ) : isMonthStillActive ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled className="gap-1 opacity-50">
                                <Lock className="h-3 w-3" />
                                Submit Month
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Available after {selectedPeriod} {selectedYear} ends
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setShowMonthlySubmitConfirm(true)}
                          className="gap-1"
                          disabled={isSubmittingMonthly}
                        >
                          <Send className="h-3 w-3" />
                          Submit Month
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Timeline Modal */}
      <KpiTimeline
        isOpen={timelineOpen}
        onClose={() => setTimelineOpen(false)}
        kpi={selectedKpi}
      />

      {/* KPI Tracker Modal */}
      <KpiTrackerModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        kpi={selectedKpi}
        allKpis={allKpis}
        submissions={allSubmissions}
        workflowStages={effectiveStages}
      />

      {/* Resubmission Confirmation Dialog */}
      <AlertDialog open={showResubmitConfirm} onOpenChange={(open) => !open && (() => { setShowResubmitConfirm(false); setPendingResubmitReason(''); })()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Re-submit Data?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
                  <p className="font-medium">
                    You can update this record only once. It will be considered final and no further update will be allowed.
                  </p>
                </div>
                {selectedSubPeriod && <p>Current submission for <strong>{selectedSubPeriod}</strong>:</p>}
                {(() => {
                  const existingSub = getCurrentSubPeriodSubmission();
                  if (!existingSub) return null;
                  return (
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p><strong>Current Value:</strong> {existingSub.achieved_value ?? '-'}</p>
                      {existingSub.submitted_at && (
                        <p><strong>Submitted On:</strong> {format(new Date(existingSub.submitted_at), 'dd MMM yyyy, hh:mm a')}</p>
                      )}
                      {existingSub.remarks && <p><strong>Remarks:</strong> {existingSub.remarks}</p>}
                    </div>
                  );
                })()}
                <div className="space-y-2 pt-2">
                  <Label htmlFor="resubmit-reason" className="text-foreground">
                    Reason for Update <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="resubmit-reason"
                    value={pendingResubmitReason}
                    onChange={(e) => setPendingResubmitReason(e.target.value)}
                    placeholder="Enter reason for modifying this submission..."
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">This reason will be logged for audit purposes.</p>
                </div>
                <p className="text-sm font-medium text-foreground">Are you sure you want to re-submit?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowResubmitConfirm(false); setPendingResubmitReason(''); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResubmit} disabled={!pendingResubmitReason.trim()}>
              Confirm & Re-submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Monthly Submission Confirmation */}
      <AlertDialog open={showMonthlySubmitConfirm} onOpenChange={setShowMonthlySubmitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Submit Monthly Review
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Submit this {selectedKpi?.frequency} KPI for manager review?</p>
                {selectedKpiSubPeriods.length === 0 && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive dark:text-red-300">
                    <p className="font-medium">⚠️ No daily entries were recorded for this month. This will be submitted with a score of 0.</p>
                  </div>
                )}
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted Days:</span>
                    <strong className="text-foreground">
                      {aggregatedSubPeriodResult?.submittedDays ?? selectedKpiSubPeriods.length} / {aggregatedSubPeriodResult?.totalDays ?? '—'}
                    </strong>
                  </div>
                  {(aggregatedSubPeriodResult?.missedDays ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Missed Days:</span>
                      <strong className="text-destructive">{aggregatedSubPeriodResult?.missedDays}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{getAggregationMethodLabel(dailyAggregationMethod)} Score:</span>
                    <strong className="text-foreground">{(aggregatedSubPeriodScore ?? 0).toFixed(2)}</strong>
                  </div>
                  {selectedKpi && (() => {
                    const isDW = selectedKpi.frequency === 'Daily' || selectedKpi.frequency === 'Weekly';
                    const isMDP = dailyAggregationMethod === 'missed_days_penalty';
                    const ratingValue = (isDW && isMDP)
                      ? Math.min(5, Math.max(0, Math.round(aggregatedSubPeriodScore ?? 0)))
                      : Math.round(calculateScoreFromAchieved(aggregatedSubPeriodScore ?? 0, selectedKpi).rating);
                    return (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rating:</span>
                        <Badge
                          style={{ backgroundColor: scoreDisplay[ratingValue]?.color || '#991B1B' }}
                          className="text-white"
                        >
                          {scoreDisplay[ratingValue]?.label || 'Not Achieved'}
                        </Badge>
                      </div>
                    );
                  })()}
                </div>
                <p className="text-sm text-muted-foreground">
                  Once submitted, the KPI will move to your manager's review queue.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingMonthly}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitMonthlyReview}
              disabled={isSubmittingMonthly}
            >
              {isSubmittingMonthly ? 'Submitting...' : 'Confirm & Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recall Confirmation Dialog */}
      <AlertDialog open={showRecallConfirm} onOpenChange={setShowRecallConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-blue-500" />
              Recall Self Review?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will withdraw your self-review submission and allow you to edit and resubmit.</p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200">
                  <p className="font-medium">The following data will be cleared:</p>
                  <ul className="list-disc ml-4 mt-1 space-y-0.5">
                    <li>Achieved value / score</li>
                    <li>Self rating</li>
                    <li>Self remarks</li>
                    <li>Evidence files</li>
                  </ul>
                </div>
                <p className="text-sm">The KPI status will revert to <strong>Pending</strong> and you can re-enter your data.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recallMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedKpi) {
                  recallMutation.mutate(selectedKpi.id, {
                    onSuccess: () => {
                      setShowRecallConfirm(false);
                      onOpenChange(false);
                    },
                  });
                }
              }}
              disabled={recallMutation.isPending}
            >
              {recallMutation.isPending ? 'Recalling...' : 'Confirm Recall'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedKpi && (
        <QueryHistoryDialog
          kpiId={selectedKpi.id}
          kpiName={selectedKpi.kpi_name}
          open={queryHistoryOpen}
          onOpenChange={setQueryHistoryOpen}
        />
      )}

      {/* Rollback Request Dialog */}
      {selectedKpi && (
        <RollbackRequestDialog
          open={rollbackDialogOpen}
          onOpenChange={setRollbackDialogOpen}
          kpiId={selectedKpi.id}
          kpiName={selectedKpi.kpi_name}
          currentStatus={selectedKpi.status}
          workflowStages={effectiveStages}
          notifyUserId={profile?.reporting_manager_id || undefined}
          stagesLoading={stagesLoading}
        />
      )}
    </>
  );
}

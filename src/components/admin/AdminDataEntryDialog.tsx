import { useState, useEffect, useCallback, useMemo } from 'react';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeWorkflowStages } from '@/hooks/useWorkflowConfig';
import { DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Calculator, CheckCircle2, Info, Lock, Loader2, ShieldAlert, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAdminSubmitReviewData, useAdminFastTrackApprove, AdminRoleLevel } from '@/hooks/useAdminDataEntry';
import { calculateRating, type RatingThresholds } from '@/lib/ratingCalculation';
import { QualitativeValueInput } from '@/components/review/QualitativeValueInput';
import { DateCalendarInput } from '@/components/review/DateCalendarInput';
import { QualitativeOption, scoreToRatingLevel } from '@/lib/qualitativeUom';
import type { KPI, RatingLevel } from '@/hooks/useKpis';
import type { Database } from '@/integrations/supabase/types';
import { isKpiLockedForPeriod, getActiveMonthForCycle } from '@/lib/frequencyUtils';
import { useFrequencyConfig } from '@/hooks/useFrequencyConfig';


// Rating options matching existing RatingSelector component
// Full 0-5 rating scale. DB enum only supports blue|green|yellow|red,
// so ratings 0 and 1 map to 'red' on submission but display distinct labels.
const RATING_OPTIONS: { value: string; dbRating: RatingLevel; label: string; colorClass: string; score: number }[] = [
  { value: '5', dbRating: 'blue',   label: 'Outstanding (5)',        colorClass: 'bg-blue-500',   score: 5 },
  { value: '4', dbRating: 'green',  label: 'Exceeds (4)',            colorClass: 'bg-green-500',  score: 4 },
  { value: '3', dbRating: 'yellow', label: 'Meets (3)',              colorClass: 'bg-yellow-500', score: 3 },
  { value: '2', dbRating: 'red',    label: 'Below (2)',              colorClass: 'bg-red-500',    score: 2 },
  { value: '1', dbRating: 'red',    label: 'Needs Improvement (1)',  colorClass: 'bg-orange-500', score: 1 },
  { value: '0', dbRating: 'red',    label: 'Not Achieved (0)',       colorClass: 'bg-gray-400',   score: 0 },
];

// Map a DB RatingLevel + numeric score back to our dropdown value
function dbRatingToDropdownValue(dbRating: RatingLevel, numericScore: number | null): string {
  if (numericScore != null) {
    const matched = RATING_OPTIONS.find(r => r.score === Math.round(numericScore));
    if (matched) return matched.value;
  }
  // Fallback: map by color
  const byColor = RATING_OPTIONS.find(r => r.dbRating === dbRating);
  return byColor?.value ?? '';
}

const ALL_ROLE_LEVELS: { value: AdminRoleLevel; label: string; stage: string }[] = [
  { value: 'self', label: 'Self Review', stage: 'self_review' },
  { value: 'manager', label: 'Manager', stage: 'manager_check' },
  { value: 'skip_level', label: 'Skip-Level', stage: 'skip_level_check' },
  { value: 'hr_pms', label: 'HR PMS', stage: 'hr_pms_review' },
  { value: 'auditor', label: 'Auditor', stage: 'audit' },
  { value: 'management', label: 'Management', stage: 'management_review' },
];

// Helper: determine if a KPI uses qualitative input
function isQualitativeKpi(kpi: KPI | null): boolean {
  return kpi?.uom_type === 'binary' || kpi?.uom_type === 'tiered';
}

// Use canonical scoreToRatingLevel from qualitativeUom (already imported on line 30)
const getRatingLevel = scoreToRatingLevel;

// Helper: extract review month/year from KPI review_period string
function parseReviewPeriod(kpi: KPI): { month: string; year: number } {
  return {
    month: kpi.review_period || 'January',
    year: kpi.review_year || new Date().getFullYear(),
  };
}

interface AdminDataEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
}

export function AdminDataEntryDialog({
  isOpen,
  onClose,
  kpi,
  employeeId,
  employeeName,
  employeeCode,
}: AdminDataEntryDialogProps) {
  const submitMutation = useAdminSubmitReviewData();
  const fastTrackMutation = useAdminFastTrackApprove();
  const kpiPeriod = kpi ? parseReviewPeriod(kpi) : null;
  const { data: workflowStages } = useEmployeeWorkflowStages(employeeId, kpiPeriod?.month, kpiPeriod?.year);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const visibleRoleLevels = useMemo(
    () => ALL_ROLE_LEVELS.filter((r) => effectiveStages.includes(r.stage)),
    [effectiveStages]
  );

  // Form state
  const [roleLevel, setRoleLevel] = useState<AdminRoleLevel>('self');
  const [achievedValue, setAchievedValue] = useState<string>('');
  const [rating, setRating] = useState<string>(''); // stores "0"-"5" numeric string
  const [score, setScore] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isNa, setIsNa] = useState<boolean>(false);
  const [originalIsNa, setOriginalIsNa] = useState<boolean>(false);
  const [advanceStatus, setAdvanceStatus] = useState<boolean>(true);
  const [isAutoCalculated, setIsAutoCalculated] = useState<boolean>(false);
  const [adminOverrideConfirmed, setAdminOverrideConfirmed] = useState<boolean>(false);
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  // Fast Track state
  const [fastTrackRating, setFastTrackRating] = useState<string>('0');
  const [fastTrackScore, setFastTrackScore] = useState<string>('0');
  const [fastTrackConfirmed, setFastTrackConfirmed] = useState<boolean>(false);
  const [fastTrackReason, setFastTrackReason] = useState<string>('');
  // Qualitative-specific state (aligned with SelfReviewSheet)
  const [calculatedRatingLevel, setCalculatedRatingLevel] = useState<RatingLevel | null>(null);
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);

  // Frequency lock check (admin is warned but can override)
  const reviewPeriodParsed = kpi ? parseReviewPeriod(kpi) : { month: 'January', year: new Date().getFullYear() };
  const { config: frequencyConfig } = useFrequencyConfig(kpi?.frequency);
  const isFrequencyLocked = kpi ? isKpiLockedForPeriod(
    kpi.frequency, reviewPeriodParsed.month, reviewPeriodParsed.year,
    kpi.frequency_cycle_start, frequencyConfig
  ) : false;
  const activeMonth = kpi ? getActiveMonthForCycle(
    kpi.frequency, reviewPeriodParsed.month, reviewPeriodParsed.year,
    kpi.frequency_cycle_start, frequencyConfig
  ) : null;


  // Detect misconfigured binary KPIs (C3: validation warning)
  const binaryMisconfigWarning = useMemo(() => {
    if (!kpi) return null;
    const uomType = kpi.uom_type;
    if (uomType !== 'binary' && uomType !== 'tiered') return null;
    const hasOptions = Array.isArray(kpi.qualitative_options) && (kpi.qualitative_options as any[]).length > 0;
    const hasThresholds = [kpi.r5, kpi.r4, kpi.r3, kpi.r2, kpi.r1].some(t => t !== null && t !== undefined && t !== '');
    if (!hasOptions && !hasThresholds) {
      return 'This KPI is configured as Binary/Tiered but has no scoring options or thresholds defined. Auto-calculation will use ratio-based fallback. Please verify the rating manually.';
    }
    if (!hasOptions) {
      return 'This KPI is configured as Binary/Tiered but has no qualitative options defined. Numeric threshold fallback will be used.';
    }
    return null;
  }, [kpi]);

  // Score calculation — matches SelfReviewSheet.calculateScoreFromAchieved exactly
  const calculateScoreFromAchieved = useCallback((achieved: number, targetKpi: KPI) => {
    const thresholds: RatingThresholds = {
      r5: targetKpi.r5, r4: targetKpi.r4, r3: targetKpi.r3,
      r2: targetKpi.r2, r1: targetKpi.r1, r0: targetKpi.r0,
    };
    const uomType = targetKpi.uom_type || 'numeric';
    const isQualitative = uomType === 'binary' || uomType === 'tiered';

    // Special case: qualitative + daily/weekly — clamp rating 0-5 directly
    if (isQualitative && (targetKpi.frequency === 'Daily' || targetKpi.frequency === 'Weekly')) {
      const r = Math.min(5, Math.max(0, Math.round(achieved)));
      const ratingLevel = r >= 4 ? 'blue' : r >= 3 ? 'green' : r >= 2 ? 'yellow' : 'red';
      return {
        rating: r,
        ratingLevel: ratingLevel as RatingLevel,
        weightedScore: (targetKpi.weightage || 0) * r,
        percentage: (r / 5) * 100,
        achievedWeight: r / 5,
      };
    }

    return calculateRating(
      achieved, targetKpi.target_value, thresholds,
      targetKpi.criteria || 'Higher is Better', targetKpi.weightage || 0,
      uomType as any, targetKpi.qualitative_options as QualitativeOption[] | null,
      targetKpi.uom, (targetKpi.threshold_mode as 'absolute' | 'ratio') || 'absolute'
    );
  }, []);

  // Auto-calculate from numeric achieved value (non-qualitative, non-date KPIs)
  const autoCalculateFromAchieved = useCallback((value: string) => {
    if (!kpi || value === '') {
      setIsAutoCalculated(false);
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      return;
    }

    const parsedNum = parseFloat(value);
    if (isNaN(parsedNum)) {
      setIsAutoCalculated(false);
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      return;
    }

    const result = calculateScoreFromAchieved(parsedNum, kpi);
    const ratingNum = result.rating;
    setCalculatedScore(ratingNum);
    setCalculatedRatingLevel(getRatingLevel(ratingNum));
    setRating(String(Math.round(ratingNum)));
    setScore(ratingNum.toFixed(2));
    setIsAutoCalculated(true);
  }, [kpi, calculateScoreFromAchieved]);

  // Handler for qualitative input (matches SelfReviewSheet.handleQualitativeChange)
  const handleQualitativeChange = useCallback((value: string, qRating: number, ratingLevel: RatingLevel) => {
    setAchievedValue(value);
    setCalculatedScore(qRating);
    setCalculatedRatingLevel(ratingLevel);
    setRating(String(Math.round(qRating)));
    setScore(qRating.toFixed(2));
    setIsAutoCalculated(true);
  }, []);

  // Handler for date input
  const handleDateChange = useCallback((day: number | null) => {
    if (day === null) {
      setAchievedValue('');
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      setRating('');
      setScore('');
      setIsAutoCalculated(false);
      return;
    }
    setAchievedValue(String(day));
    if (kpi) {
      const result = calculateScoreFromAchieved(day, kpi);
      setCalculatedScore(result.rating);
      setCalculatedRatingLevel(getRatingLevel(result.rating));
      setRating(String(Math.round(result.rating)));
      setScore(result.rating.toFixed(2));
      setIsAutoCalculated(true);
    }
  }, [kpi, calculateScoreFromAchieved]);

  // Fetch existing submission
  const { data: existingSubmission, isLoading: loadingSubmission } = useQuery({
    queryKey: ['review-submission-admin', kpi?.id],
    queryFn: async () => {
      if (!kpi?.id) return null;
      const { data, error } = await supabase
        .from('review_submissions')
        .select('*')
        .eq('kpi_id', kpi.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!kpi?.id && isOpen,
  });

  // Consistency check: compare stored vs calculated rating on load
  const consistencyWarning = useMemo(() => {
    if (!kpi || !existingSubmission) return null;
    const storedAchieved = existingSubmission.achieved_value;
    const storedScore = existingSubmission.self_score;
    const storedRating = existingSubmission.self_rating;
    if (storedAchieved == null || storedRating == null) return null;

    const result = calculateScoreFromAchieved(storedAchieved, kpi);
    const calculatedRatingNum = Math.round(result.rating);
    const storedRatingNum = storedScore != null ? Math.round(storedScore) : null;

    if (storedRatingNum != null && Math.abs(calculatedRatingNum - storedRatingNum) >= 2) {
      const calcLabel = RATING_OPTIONS.find(r => r.score === calculatedRatingNum)?.label || `Rating ${calculatedRatingNum}`;
      const storedLabel = RATING_OPTIONS.find(r => r.score === storedRatingNum)?.label || `Rating ${storedRatingNum}`;
      return `Stored rating (${storedLabel}) differs significantly from calculated rating (${calcLabel}). The KPI may be misconfigured.`;
    }
    return null;
  }, [kpi, existingSubmission, calculateScoreFromAchieved]);

  // Load existing data when role level changes
  useEffect(() => {
    if (!existingSubmission) {
      setAchievedValue('');
      setRating('');
      setScore('');
      setRemarks('');
      setIsNa(false);
      setOriginalIsNa(false);
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      setEvidenceUrls([]);
      return;
    }

    const naState = existingSubmission.is_na === true;
    setIsNa(naState);
    setOriginalIsNa(naState);
    // Get values based on role level — map DB rating back to dropdown value using score
    const loadLevel = (
      achievedVal: number | null,
      dbRatingVal: string | null,
      scoreVal: number | null,
      remarksVal: string | null
    ) => {
      if (achievedVal != null) {
        // For qualitative KPIs, try to resolve label from stored numeric rating
        if (kpi && isQualitativeKpi(kpi)) {
          const options = kpi.uom_type === 'binary'
            ? ((kpi.qualitative_options as QualitativeOption[] | null)?.length ? (kpi.qualitative_options as QualitativeOption[]) : [{ label: 'Yes', rating: 5, definition: 'Yes' }, { label: 'No', rating: 0, definition: 'No' }])
            : (kpi.qualitative_options as QualitativeOption[] | null) || [];
          const matchedOption = options.find(o => o.rating === achievedVal || o.label === String(achievedVal));
          if (matchedOption) {
            setAchievedValue(matchedOption.label);
            setCalculatedScore(matchedOption.rating);
            setCalculatedRatingLevel(scoreToRatingLevel(matchedOption.rating) as RatingLevel);
          } else {
            setAchievedValue(String(achievedVal));
            setCalculatedScore(scoreVal);
            setCalculatedRatingLevel(null);
          }
        } else {
          setAchievedValue(String(achievedVal));
          setCalculatedScore(scoreVal);
          setCalculatedRatingLevel(null);
        }
      } else {
        setAchievedValue('');
        setCalculatedScore(null);
        setCalculatedRatingLevel(null);
      }

      // Derive dropdown value from score (the raw rating 0-5 is now stored as score)
      if (dbRatingVal && scoreVal != null) {
        setRating(dbRatingToDropdownValue(dbRatingVal as RatingLevel, scoreVal));
      } else if (dbRatingVal) {
        setRating(dbRatingToDropdownValue(dbRatingVal as RatingLevel, null));
      } else {
        setRating('');
      }
      setScore(scoreVal != null ? scoreVal.toString() : '');
      setRemarks(remarksVal || '');
    };

    // Load multi-file evidence URLs, fall back to legacy single URL
    const evidenceUrlsKey = roleLevel === 'self' ? 'self_evidence_urls' : `${roleLevel}_evidence_urls`;
    const evidenceLegacyKey = roleLevel === 'self' ? 'self_evidence_url' : `${roleLevel}_evidence_url`;
    const storedUrls = (existingSubmission as any)[evidenceUrlsKey];
    const legacyUrl = (existingSubmission as any)[evidenceLegacyKey];
    if (Array.isArray(storedUrls) && storedUrls.length > 0) {
      setEvidenceUrls(storedUrls);
    } else if (legacyUrl) {
      setEvidenceUrls([legacyUrl]);
    } else {
      setEvidenceUrls([]);
    }

    switch (roleLevel) {
      case 'self':
        loadLevel(existingSubmission.achieved_value, existingSubmission.self_rating, existingSubmission.self_score, existingSubmission.self_remarks);
        break;
      case 'manager':
        loadLevel(existingSubmission.manager_achieved_value, existingSubmission.manager_rating, existingSubmission.manager_score, existingSubmission.manager_remarks);
        break;
      case 'skip_level':
        loadLevel(
          (existingSubmission as any).skip_level_achieved_value ?? null,
          (existingSubmission as any).skip_level_rating ?? null,
          (existingSubmission as any).skip_level_score ?? null,
          (existingSubmission as any).skip_level_remarks ?? null
        );
        break;
      case 'hr_pms':
        loadLevel(
          (existingSubmission as any).hr_pms_achieved_value ?? null,
          (existingSubmission as any).hr_pms_rating ?? null,
          (existingSubmission as any).hr_pms_score ?? null,
          (existingSubmission as any).hr_pms_remarks ?? null
        );
        break;
      case 'auditor':
        loadLevel(existingSubmission.auditor_achieved_value, existingSubmission.auditor_rating, existingSubmission.auditor_score, existingSubmission.auditor_remarks);
        break;
      case 'management':
        loadLevel(existingSubmission.management_achieved_value, existingSubmission.management_rating, existingSubmission.management_score, existingSubmission.management_remarks);
        break;
    }
  }, [roleLevel, existingSubmission, kpi]);

  // Auto-calculate score when rating changes (manual override only for non-qualitative)
  useEffect(() => {
    if (rating && kpi?.weightage && !isAutoCalculated) {
      const ratingNum = parseInt(rating, 10);
      if (!isNaN(ratingNum)) {
        setCalculatedScore(ratingNum);
        setScore(ratingNum.toFixed(2));
      }
    }
  }, [rating, kpi?.weightage, isAutoCalculated]);

  // Reset form when dialog closes — includes adminOverrideConfirmed (Fix 3)
  useEffect(() => {
    if (!isOpen) {
      setRoleLevel('self');
      setAchievedValue('');
      setRating('');
      setScore('');
      setRemarks('');
      setReason('');
      setIsNa(false);
      setAdvanceStatus(true);
      setAdminOverrideConfirmed(false);
      setFastTrackRating('0');
      setFastTrackScore('0');
      setFastTrackConfirmed(false);
      setFastTrackReason('');
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      setIsAutoCalculated(false);
      setEvidenceUrls([]);
    }
  }, [isOpen]);

  // Auto-set advanceStatus=false when role is 'self' and KPI is already past kra_set (Fix 2a)
  // This prevents accidental demotion — data-only updates are the common intent here.
  const STAGE_ORDER_UI = [
    'kra_set', 'self_review', 'manager_check', 'skip_level_check',
    'hr_pms_review', 'audit', 'management_review', 'approved',
  ];
  const kpiCurrentStatus = kpi?.status || 'kra_set';
  const kpiStatusIdx = STAGE_ORDER_UI.indexOf(kpiCurrentStatus);
  const selfReviewIdxUI = STAGE_ORDER_UI.indexOf('self_review');
  const kpiAlreadyPastKraSet = kpiStatusIdx >= selfReviewIdxUI;
  const advanceWouldHaveNoEffect = roleLevel === 'self' && kpiAlreadyPastKraSet;

  // When switching to self-role and KPI is already in review, default advanceStatus to false
  // When switching to auditor/management role, default advanceStatus to true to prevent stuck KPIs
  useEffect(() => {
    if (roleLevel === 'self' && kpiAlreadyPastKraSet) {
      setAdvanceStatus(false);
    } else if (roleLevel === 'auditor' || roleLevel === 'management') {
      setAdvanceStatus(true);
    }
  }, [roleLevel, kpiAlreadyPastKraSet]);

  const maxScore = kpi?.weightage || 0;

  // Fast Track: determine which review stages are still missing data
  const REVIEWABLE_ROLE_STAGES: { role: AdminRoleLevel; ratingKey: string; stage: string }[] = [
    { role: 'manager', ratingKey: 'manager_rating', stage: 'manager_check' },
    { role: 'skip_level', ratingKey: 'skip_level_rating', stage: 'skip_level_check' },
    { role: 'hr_pms', ratingKey: 'hr_pms_rating', stage: 'hr_pms_review' },
    { role: 'auditor', ratingKey: 'auditor_rating', stage: 'audit' },
    { role: 'management', ratingKey: 'management_rating', stage: 'management_review' },
  ];
  // Only stages that are part of this employee's workflow AND have no rating yet
  const remainingStages = useMemo(() => {
    return REVIEWABLE_ROLE_STAGES
      .filter((rs) => effectiveStages.includes(rs.stage))
      .filter((rs) => {
        if (!existingSubmission) return true;
        const val = (existingSubmission as Record<string, unknown>)[rs.ratingKey];
        return val === null || val === undefined;
      })
      .map((rs) => rs.role);
  }, [effectiveStages, existingSubmission]);

  const showFastTrack = kpiCurrentStatus !== 'approved' && remainingStages.length > 0;

  const handleFastTrack = async () => {
    if (!kpi || !fastTrackReason.trim() || !fastTrackConfirmed) return;
    const ftRatingOpt = RATING_OPTIONS.find(r => r.value === fastTrackRating);
    if (!ftRatingOpt) return;

    await fastTrackMutation.mutateAsync({
      kpi_id: kpi.id,
      employee_id: employeeId,
      rating: ftRatingOpt.dbRating,
      score: ftRatingOpt.score,
      achieved_value: null,
      reason: fastTrackReason.trim(),
      kpi_name: kpi.kpi_name,
      remaining_stages: remainingStages,
    });
    onClose();
  };

  const handleScoreChange = (val: string) => {
    const num = parseFloat(val);
    if (val === '' || isNaN(num)) {
      setScore(val);
    } else {
      // Score is now raw rating 0-5, clamp accordingly
      const clamped = Math.max(0, Math.min(num, 5));
      setScore(clamped.toFixed(2));
      setCalculatedScore(clamped);
    }
    setIsAutoCalculated(false);
  };

  const handleSubmit = async () => {
    if (!kpi || !reason.trim()) return;

    // Determine achieved_value, rating, and score aligned with SelfReviewSheet logic
    let submitAchievedValue: number | null = null;
    let submitRating: RatingLevel | null = null;
    let submitScore: number | null = null;

    if (isNa) {
      // N/A: null values
      submitAchievedValue = null;
      submitRating = null;
      submitScore = null;
    } else if (isQualitativeKpi(kpi)) {
      // Qualitative KPIs: store numeric rating as achieved_value (matches SelfReviewSheet)
      submitAchievedValue = calculatedScore;
      submitRating = calculatedRatingLevel;
      submitScore = calculatedScore;
    } else {
      // Numeric/Date KPIs: store parsed number as achieved_value
      submitAchievedValue = achievedValue !== '' ? parseFloat(achievedValue) : null;
      submitRating = calculatedScore !== null ? getRatingLevel(calculatedScore) : null;
      submitScore = calculatedScore;
    }

    await submitMutation.mutateAsync({
      kpi_id: kpi.id,
      employee_id: employeeId,
      role_level: roleLevel,
      achieved_value: submitAchievedValue,
      rating: submitRating,
      score: submitScore,
      remarks: remarks || null,
      evidence_url: evidenceUrls.length > 0 ? evidenceUrls[evidenceUrls.length - 1] : null,
      evidence_urls: evidenceUrls.length > 0 ? evidenceUrls : null,
      is_na: isNa !== originalIsNa ? isNa : undefined,
      reason: reason.trim(),
      kpi_name: kpi.kpi_name,
      advance_status: advanceStatus,
    });

    onClose();
  };

  // BUG-047 / POLICY §116 — On-behalf submissions for any reviewer stage
  // (manager, skip_level, hr_pms, auditor, management) MUST carry either a
  // numeric score / rating OR the explicit N/A flag. Otherwise the KPI
  // would advance past that stage with no audit-grade signature, which
  // breaks "<stage> Reviewed" dashboard counters (BUG-047 root cause).
  const requiresScoreOrNa = roleLevel !== 'self';
  const hasScoreSignature =
    isNa ||
    (calculatedScore !== null && !Number.isNaN(calculatedScore)) ||
    (score !== '' && !Number.isNaN(parseFloat(score)));
  const onBehalfPayloadValid = !requiresScoreOrNa || hasScoreSignature;
  const isValid =
    reason.trim().length > 0 &&
    onBehalfPayloadValid &&
    (!isFrequencyLocked || adminOverrideConfirmed);
  const anyMutationPending = submitMutation.isPending || fastTrackMutation.isPending;

  // For DateCalendarInput — reviewPeriodParsed already computed above
  const reviewPeriod = reviewPeriodParsed;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Admin Data Entry
          </DialogTitle>
          <DialogDescription>
            {kpi && (
              <div className="space-y-1 mt-2">
                <div className="font-medium text-foreground">{kpi.kpi_name}</div>
                <div className="text-sm">
                  Employee: <span className="font-medium">{employeeName}</span>
                  {employeeCode && <span className="text-muted-foreground"> ({employeeCode})</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {kpi.review_period} {kpi.review_year} · Weightage: {kpi.weightage}%
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {loadingSubmission ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-6 py-4 pr-2">
            {/* Role Level Selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Data Entry Level</Label>
              <RadioGroup
                value={roleLevel}
                onValueChange={(v) => setRoleLevel(v as AdminRoleLevel)}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
              >
                {visibleRoleLevels.map((role) => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={role.value} id={role.value} />
                    <Label htmlFor={role.value} className="font-normal cursor-pointer">
                      {role.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Frequency Lock Warning — shown for Bi-Monthly, Quarterly, etc. in locked months */}
            {isFrequencyLocked && (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="space-y-3">
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
                      Frequency Lock Active — {kpi?.frequency} KPI
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                      This KPI is locked for <strong>{reviewPeriodParsed.month}</strong> because it is not the active review month
                      {activeMonth ? <> (entry opens in <strong>{activeMonth}</strong>)</> : ''}.
                      Employees cannot submit during this period.
                    </p>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded border border-amber-300 dark:border-amber-600 bg-amber-100/50 dark:bg-amber-900/20">
                    <Checkbox
                      id="admin-override-confirm"
                      checked={adminOverrideConfirmed}
                      onCheckedChange={(v) => setAdminOverrideConfirmed(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="admin-override-confirm" className="cursor-pointer text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                      I confirm this is an intentional admin override for a locked frequency period.
                      This action will be logged in the audit trail.
                    </Label>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Quick Fill: No Data (Zero Score) — standalone section, always visible */}

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-dashed text-muted-foreground hover:text-foreground gap-2"
                onClick={() => {
                  setAchievedValue('0');
                  setRating('0');
                  setScore('0.00');
                  setCalculatedScore(0);
                  setCalculatedRatingLevel('red');
                  setIsAutoCalculated(false);
                  setIsNa(false);
                  if (!reason.trim()) {
                    setReason('No data submitted — scored as zero by admin');
                  }
                }}
                disabled={isNa}
              >
                <Zap className="h-3.5 w-3.5" />
                Quick Fill: No Data (Score = 0)
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Pre-fills all fields with zero score. Use when employee has not submitted any data. Does not mark as N/A.
              </p>
            </div>

            {/* Current Value Indicator */}
            {existingSubmission && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">Current {roleLevel} values: </span>
                {(() => {
                  const currentRating = roleLevel === 'self' 
                    ? existingSubmission.self_rating 
                    : (existingSubmission as Record<string, unknown>)[`${roleLevel}_rating`];
                  const currentScore = roleLevel === 'self'
                    ? existingSubmission.self_score
                    : (existingSubmission as Record<string, unknown>)[`${roleLevel}_score`];
                  
                  if (!currentRating && !currentScore) {
                    return <span className="text-muted-foreground">Not set</span>;
                  }
                  
                  return (
                    <span>
                      {currentRating && <Badge variant="outline" className="mr-2">{String(currentRating)}</Badge>}
                      {currentScore && <span>Score: {String(currentScore)}</span>}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Binary KPI misconfiguration warning */}
            {binaryMisconfigWarning && (
              <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
                <Info className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
                  {binaryMisconfigWarning}
                </AlertDescription>
              </Alert>
            )}

            {/* Consistency check warning */}
            {consistencyWarning && (
              <Alert className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/20">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm text-orange-800 dark:text-orange-200">
                  {consistencyWarning}
                </AlertDescription>
              </Alert>
            )}

            {/* N/A Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="na-toggle" className="text-sm font-medium">Mark as Not Applicable</Label>
                <p className="text-xs text-muted-foreground">
                  {existingSubmission?.is_na ? 'Currently marked N/A — toggle off to include in scoring' : 'Toggle on to exclude from scoring'}
                </p>
              </div>
              <Switch
                id="na-toggle"
                checked={isNa}
                onCheckedChange={setIsNa}
              />
            </div>

            {/* Data Entry Fields */}
            <div className="grid gap-4">
              {/* Achieved Value — conditional rendering based on KPI type */}
              <div className="space-y-2">
                {kpi && isQualitativeKpi(kpi) ? (
                  /* C1: Qualitative input — same component as SelfReviewSheet */
                  <QualitativeValueInput
                    uomType={kpi.uom_type as 'binary' | 'tiered'}
                    qualitativeOptions={kpi.qualitative_options as QualitativeOption[] | null}
                    value={achievedValue || null}
                    onChange={handleQualitativeChange}
                    disabled={isNa}
                    label="Achieved Value"
                  />
                ) : kpi?.uom === 'Date' ? (
                  /* C1: Date input — same component as SelfReviewSheet */
                  <DateCalendarInput
                    value={achievedValue ? parseInt(achievedValue, 10) : null}
                    onChange={handleDateChange}
                    reviewMonth={reviewPeriod.month}
                    reviewYear={reviewPeriod.year}
                    disabled={isNa}
                    label="Achieved Value (Date)"
                  />
                ) : (
                  /* Default: numeric input */
                  <>
                    <Label htmlFor="achieved-value">Achieved Value</Label>
                    <Input
                      id="achieved-value"
                      type="number"
                      step="any"
                      value={achievedValue}
                      onChange={(e) => {
                        setAchievedValue(e.target.value);
                        autoCalculateFromAchieved(e.target.value);
                      }}
                      placeholder={`Target: ${kpi?.target_value ?? 'N/A'}`}
                      disabled={isNa}
                    />
                  </>
                )}
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <Label>Rating {isAutoCalculated && <Badge variant="secondary" className="ml-2 text-xs"><Calculator className="h-3 w-3 mr-1 inline" />Auto</Badge>}</Label>
                <Select value={rating} onValueChange={(v) => { setRating(v); setIsAutoCalculated(false); const num = parseInt(v, 10); if (!isNaN(num)) { setCalculatedScore(num); setCalculatedRatingLevel(getRatingLevel(num)); setScore(num.toFixed(2)); } }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rating" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATING_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${opt.colorClass}`} />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Score — now stores raw rating (0-5), not (rating/5)*weightage */}
              <div className="space-y-2">
                <Label htmlFor="score">Score (Rating 0-5) {isAutoCalculated && <Badge variant="secondary" className="ml-2 text-xs"><Calculator className="h-3 w-3 mr-1 inline" />Auto</Badge>}</Label>
                <Input
                  id="score"
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={score}
                  onChange={(e) => handleScoreChange(e.target.value)}
                  placeholder="Calculated from achieved value"
                />
                <p className="text-xs text-muted-foreground">
                  Score is the raw rating (0-5) from the scoring engine, matching Self Review logic. Auto-calculated from achieved value using KPI thresholds.
                </p>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional remarks..."
                  rows={2}
                />
              </div>

              {/* Evidence Upload */}
              {kpi && (
                <MultiFileUpload
                  userId={employeeId}
                  contextId={kpi.id}
                  folder={roleLevel === 'self' ? 'self-evidence' : `${roleLevel}-evidence`}
                  existingUrls={evidenceUrls}
                  onUploadComplete={setEvidenceUrls}
                  maxFiles={5}
                  label="Evidence Attachments"
                />
              )}
            </div>

            {/* Advance Workflow Status Toggle */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="advance-status" className="text-sm font-medium">
                    Advance workflow status
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Move the KPI to the next workflow stage after saving
                  </p>
                </div>
                <Switch
                  id="advance-status"
                  checked={advanceStatus}
                  onCheckedChange={setAdvanceStatus}
                />
              </div>

              {/* Fix 2b — Warn when advance toggle is ON but would have no effect (or demote) */}
              {advanceWouldHaveNoEffect && advanceStatus && (
                <Alert className="border-info/30 bg-info/5">
                  <Info className="h-4 w-4 text-info" />
                  <AlertDescription className="text-sm text-foreground">
                    This KPI is already at <strong>{kpiCurrentStatus.replace(/_/g, ' ')}</strong>. Enabling "Advance workflow" for a Self-level entry will have <strong>no effect</strong> — the status will not be changed. Only the data will be updated.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Reason for Admin Entry - MANDATORY */}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="reason" className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Reason for Admin Entry *
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter the reason for this administrative data entry (required for audit trail)..."
                rows={3}
                className={!reason.trim() ? 'border-warning' : ''}
              />
              <p className="text-xs text-muted-foreground">
                This reason will be logged for audit purposes and included in the employee notification.
              </p>
            </div>

            {/* Fast Track to Approved Section */}
            {showFastTrack && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <Label className="text-base font-semibold">Fast Track to Approved</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fills all remaining review stages in one step and marks this KPI as <strong>Approved</strong>.
                  Remaining stages: <strong>{remainingStages.map(s => ALL_ROLE_LEVELS.find(r => r.value === s)?.label || s).join(', ')}</strong>
                </p>

                <div className="rounded-lg border border-dashed p-4 space-y-4">
                  {/* Rating selector for fast track */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Apply Rating to All Stages</Label>
                      <Select value={fastTrackRating} onValueChange={(v) => {
                        setFastTrackRating(v);
                        const opt = RATING_OPTIONS.find(r => r.value === v);
                        if (opt) setFastTrackScore(String(opt.score));
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select rating" />
                        </SelectTrigger>
                        <SelectContent>
                          {RATING_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${opt.colorClass}`} />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Score (0–5)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.01"
                        value={fastTrackScore}
                        onChange={(e) => setFastTrackScore(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Fast Track reason */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reason for Fast Track *</Label>
                    <Textarea
                      value={fastTrackReason}
                      onChange={(e) => setFastTrackReason(e.target.value)}
                      placeholder="Enter reason for fast-tracking to Approved (required for audit trail)..."
                      rows={2}
                      className={!fastTrackReason.trim() ? 'border-warning text-sm' : 'text-sm'}
                    />
                  </div>

                  {/* Confirmation checkbox */}
                  <div className="flex items-start gap-2 p-2 rounded border border-border bg-muted/30">
                    <Checkbox
                      id="fast-track-confirm"
                      checked={fastTrackConfirmed}
                      onCheckedChange={(v) => setFastTrackConfirmed(!!v)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="fast-track-confirm" className="cursor-pointer text-xs leading-relaxed">
                      I confirm this will fill <strong>all remaining {remainingStages.length} stage(s)</strong> with the selected rating and mark this KPI as <strong>Approved</strong>. This action is irreversible without an admin step-back.
                    </Label>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full gap-2"
                    onClick={handleFastTrack}
                    disabled={!fastTrackConfirmed || !fastTrackReason.trim() || fastTrackMutation.isPending}
                  >
                    {fastTrackMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CheckCircle2 className="h-4 w-4" />
                    }
                    Fast Track Approve ({remainingStages.length} stage{remainingStages.length > 1 ? 's' : ''})
                  </Button>
                </div>
              </div>
            )}

            {/* Warning Banner */}
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning">Admin Override</p>
                <p className="text-muted-foreground">
                  This action is logged in the audit trail and the employee will be notified of this change.
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {requiresScoreOrNa && !onBehalfPayloadValid && reason.trim().length > 0 && (
            <p className="text-xs text-destructive mr-auto self-center">
              Provide a score/rating or toggle <strong>Mark as N/A</strong> before submitting (POLICY §116).
            </p>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || anyMutationPending}
          >
            {anyMutationPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

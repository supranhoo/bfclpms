import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { AlertTriangle, Calculator, Info, Loader2, ShieldAlert, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAdminSubmitReviewData, AdminRoleLevel } from '@/hooks/useAdminDataEntry';
import { calculateRating, type RatingThresholds } from '@/lib/ratingCalculation';
import { QualitativeValueInput } from '@/components/review/QualitativeValueInput';
import { DateCalendarInput } from '@/components/review/DateCalendarInput';
import { QualitativeOption, scoreToRatingLevel } from '@/lib/qualitativeUom';
import type { KPI, RatingLevel } from '@/hooks/useKpis';
import type { Database } from '@/integrations/supabase/types';

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

// Helper: derive rating level from numeric score (matches SelfReviewSheet.getRatingLevel)
function getRatingLevel(score: number): RatingLevel {
  if (score >= 4) return 'blue';
  if (score >= 3) return 'green';
  if (score >= 2) return 'yellow';
  return 'red';
}

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

  // Fetch employee's workflow stages to determine which role levels to show
  const { data: workflowStages } = useEmployeeWorkflowStages(employeeId);
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
  const [advanceStatus, setAdvanceStatus] = useState<boolean>(true);
  const [isAutoCalculated, setIsAutoCalculated] = useState<boolean>(false);
  // Qualitative-specific state (aligned with SelfReviewSheet)
  const [calculatedRatingLevel, setCalculatedRatingLevel] = useState<RatingLevel | null>(null);
  const [calculatedScore, setCalculatedScore] = useState<number | null>(null);

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
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      return;
    }

    setIsNa(existingSubmission.is_na === true);

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
            ? [{ label: 'Yes', rating: 5, definition: 'Yes' }, { label: 'No', rating: 0, definition: 'No' }]
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

  // Reset form when dialog closes
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
      setCalculatedScore(null);
      setCalculatedRatingLevel(null);
      setIsAutoCalculated(false);
    }
  }, [isOpen]);

  const maxScore = kpi?.weightage || 0;

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
      is_na: isNa,
      reason: reason.trim(),
      kpi_name: kpi.kpi_name,
      advance_status: advanceStatus,
    });

    onClose();
  };

  const isValid = reason.trim().length > 0;

  // For DateCalendarInput
  const reviewPeriod = kpi ? parseReviewPeriod(kpi) : { month: 'January', year: new Date().getFullYear() };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-6 py-4">
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
            </div>

            {/* Advance Workflow Status Toggle */}
            <div className="flex items-center justify-between border-t pt-4">
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || submitMutation.isPending}
          >
            {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

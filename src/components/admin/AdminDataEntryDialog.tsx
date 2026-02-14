import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { AlertTriangle, Calculator, Loader2, ShieldAlert } from 'lucide-react';
import { useAdminSubmitReviewData, AdminRoleLevel } from '@/hooks/useAdminDataEntry';
import { calculateRating, type RatingThresholds } from '@/lib/ratingCalculation';
import type { KPI } from '@/hooks/useKpis';
import type { Database } from '@/integrations/supabase/types';

type RatingLevel = Database['public']['Enums']['rating_level'];

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

// Get score for a rating option value (numeric string "0"-"5")
function getRatingScore(ratingValue: string): number {
  return RATING_OPTIONS.find(r => r.value === ratingValue)?.score ?? 0;
}

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

const ROLE_LEVELS: { value: AdminRoleLevel; label: string }[] = [
  { value: 'self', label: 'Self Review' },
  { value: 'manager', label: 'Manager' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
];

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

  // Form state
  const [roleLevel, setRoleLevel] = useState<AdminRoleLevel>('self');
  const [achievedValue, setAchievedValue] = useState<string>('');
  const [rating, setRating] = useState<string>(''); // stores "0"-"5" numeric string
  const [score, setScore] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isNa, setIsNa] = useState<boolean>(false);
  const [isAutoCalculated, setIsAutoCalculated] = useState<boolean>(false);

  // Auto-calculate rating/score from achieved value using the same engine as self-review
  const autoCalculateFromAchieved = useCallback((value: string) => {
    if (!kpi || value === '') {
      setIsAutoCalculated(false);
      return;
    }

    const thresholds: RatingThresholds = {
      r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: null,
    };

    const result = calculateRating(
      parseFloat(value),
      kpi.target_value,
      thresholds,
      kpi.criteria || 'Higher is Better',
      kpi.weightage || 0,
      (kpi.uom_type as 'numeric' | 'binary' | 'tiered') || 'numeric',
      kpi.qualitative_options as any,
      kpi.uom,
      (kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute'
    );

    // Map numeric rating to our dropdown value directly
    const dropdownValue = String(Math.round(result.rating));
    setRating(dropdownValue);
    // Score = (rating / 5) * weightage, clamped to max
    const maxScore = kpi.weightage || 0;
    const calculatedScore = Math.min((result.rating / 5) * maxScore, maxScore);
    setScore(calculatedScore.toFixed(2));
    setIsAutoCalculated(true);
  }, [kpi]);

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

  // Load existing data when role level changes
  useEffect(() => {
    if (!existingSubmission) {
      setAchievedValue('');
      setRating('');
      setScore('');
      setRemarks('');
      setIsNa(false);
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
      setAchievedValue(achievedVal != null ? achievedVal.toString() : '');
      // Derive dropdown value from score (more accurate) falling back to DB rating
      if (dbRatingVal && scoreVal != null) {
        setRating(dbRatingToDropdownValue(dbRatingVal as RatingLevel, (scoreVal / (kpi?.weightage || 1)) * 5));
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
      case 'auditor':
        loadLevel(existingSubmission.auditor_achieved_value, existingSubmission.auditor_rating, existingSubmission.auditor_score, existingSubmission.auditor_remarks);
        break;
      case 'management':
        loadLevel(existingSubmission.management_achieved_value, existingSubmission.management_rating, existingSubmission.management_score, existingSubmission.management_remarks);
        break;
    }
  }, [roleLevel, existingSubmission]);

  // Auto-calculate score when rating changes (manual override)
  useEffect(() => {
    if (rating && kpi?.weightage) {
      const ratingScore = getRatingScore(rating);
      const maxScore = kpi.weightage;
      const calculatedScore = Math.min((ratingScore / 5) * maxScore, maxScore);
      setScore(calculatedScore.toFixed(2));
      if (!isAutoCalculated) {
        setIsAutoCalculated(false);
      }
    }
  }, [rating, kpi?.weightage]);

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
    }
  }, [isOpen]);

  const maxScore = kpi?.weightage || 0;

  const handleScoreChange = (val: string) => {
    const num = parseFloat(val);
    if (val === '' || isNaN(num)) {
      setScore(val);
    } else {
      const clamped = Math.max(0, Math.min(num, maxScore));
      setScore(clamped.toFixed(2));
    }
    setIsAutoCalculated(false);
  };

  const handleSubmit = async () => {
    if (!kpi || !reason.trim()) return;

    // Map dropdown value back to DB-compatible RatingLevel
    const selectedOption = RATING_OPTIONS.find(r => r.value === rating);
    const dbRating: RatingLevel | null = selectedOption ? selectedOption.dbRating : null;

    await submitMutation.mutateAsync({
      kpi_id: kpi.id,
      employee_id: employeeId,
      role_level: roleLevel,
      achieved_value: achievedValue !== '' ? parseFloat(achievedValue) : null,
      rating: dbRating,
      score: score !== '' ? parseFloat(score) : null,
      remarks: remarks || null,
      is_na: isNa,
      reason: reason.trim(),
      kpi_name: kpi.kpi_name,
    });

    onClose();
  };

  const isValid = reason.trim().length > 0;

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
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {ROLE_LEVELS.map((role) => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={role.value} id={role.value} />
                    <Label htmlFor={role.value} className="font-normal cursor-pointer">
                      {role.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Current Value Indicator */}
            {existingSubmission && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">Current {roleLevel} values: </span>
                {(() => {
                  const prefix = roleLevel === 'self' ? '' : `${roleLevel}_`;
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
              {/* Achieved Value */}
              <div className="space-y-2">
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
                />
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <Label>Rating {isAutoCalculated && <Badge variant="secondary" className="ml-2 text-xs"><Calculator className="h-3 w-3 mr-1 inline" />Auto</Badge>}</Label>
                <Select value={rating} onValueChange={(v) => { setRating(v); setIsAutoCalculated(false); }}>
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

              {/* Score */}
              <div className="space-y-2">
                <Label htmlFor="score">Score {isAutoCalculated && <Badge variant="secondary" className="ml-2 text-xs"><Calculator className="h-3 w-3 mr-1 inline" />Auto</Badge>}</Label>
                <Input
                  id="score"
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxScore}
                  value={score}
                  onChange={(e) => handleScoreChange(e.target.value)}
                  placeholder="Calculated from achieved value"
                />
                <p className="text-xs text-muted-foreground">
                  Max score: {maxScore.toFixed(2)} (based on weightage). Auto-calculated from achieved value using KPI thresholds.
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

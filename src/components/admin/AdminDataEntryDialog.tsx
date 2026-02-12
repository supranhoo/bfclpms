import { useState, useEffect } from 'react';
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
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { useAdminSubmitReviewData, AdminRoleLevel } from '@/hooks/useAdminDataEntry';
import type { KPI } from '@/hooks/useKpis';
import type { Database } from '@/integrations/supabase/types';

type RatingLevel = Database['public']['Enums']['rating_level'];

// Rating options matching existing RatingSelector component
const RATING_OPTIONS: { value: RatingLevel; label: string; colorClass: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding (5)', colorClass: 'bg-blue-500', score: 5 },
  { value: 'green', label: 'Exceeds (4)', colorClass: 'bg-green-500', score: 4 },
  { value: 'yellow', label: 'Meets (3)', colorClass: 'bg-yellow-500', score: 3 },
  { value: 'red', label: 'Below (2)', colorClass: 'bg-red-500', score: 2 },
];

// Get score for a rating
function getRatingScore(rating: RatingLevel): number {
  return RATING_OPTIONS.find(r => r.value === rating)?.score || 0;
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
  const [rating, setRating] = useState<RatingLevel | ''>('');
  const [score, setScore] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [reason, setReason] = useState<string>('');

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
      return;
    }

    // Get values based on role level
    switch (roleLevel) {
      case 'self':
        setAchievedValue(existingSubmission.achieved_value != null ? existingSubmission.achieved_value.toString() : '');
        setRating(existingSubmission.self_rating || '');
        setScore(existingSubmission.self_score != null ? existingSubmission.self_score.toString() : '');
        setRemarks(existingSubmission.self_remarks || '');
        break;
      case 'manager':
        setAchievedValue(existingSubmission.manager_achieved_value != null ? existingSubmission.manager_achieved_value.toString() : '');
        setRating(existingSubmission.manager_rating || '');
        setScore(existingSubmission.manager_score != null ? existingSubmission.manager_score.toString() : '');
        setRemarks(existingSubmission.manager_remarks || '');
        break;
      case 'auditor':
        setAchievedValue(existingSubmission.auditor_achieved_value != null ? existingSubmission.auditor_achieved_value.toString() : '');
        setRating(existingSubmission.auditor_rating || '');
        setScore(existingSubmission.auditor_score != null ? existingSubmission.auditor_score.toString() : '');
        setRemarks(existingSubmission.auditor_remarks || '');
        break;
      case 'management':
        setAchievedValue(existingSubmission.management_achieved_value != null ? existingSubmission.management_achieved_value.toString() : '');
        setRating(existingSubmission.management_rating || '');
        setScore(existingSubmission.management_score != null ? existingSubmission.management_score.toString() : '');
        setRemarks(existingSubmission.management_remarks || '');
        break;
    }
  }, [roleLevel, existingSubmission]);

  // Auto-calculate score when rating changes
  useEffect(() => {
    if (rating && kpi?.weightage) {
      const ratingScore = getRatingScore(rating as RatingLevel);
      const calculatedScore = (ratingScore / 5) * kpi.weightage;
      setScore(calculatedScore.toFixed(2));
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
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!kpi || !reason.trim()) return;

    await submitMutation.mutateAsync({
      kpi_id: kpi.id,
      employee_id: employeeId,
      role_level: roleLevel,
      achieved_value: achievedValue ? parseFloat(achievedValue) : null,
      rating: rating || null,
      score: score ? parseFloat(score) : null,
      remarks: remarks || null,
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
                  onChange={(e) => setAchievedValue(e.target.value)}
                  placeholder={`Target: ${kpi?.target_value || 'N/A'}`}
                />
              </div>

              {/* Rating */}
              <div className="space-y-2">
                <Label>Rating</Label>
                <Select value={rating} onValueChange={(v) => setRating(v as RatingLevel)}>
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
                <Label htmlFor="score">Score (Auto-calculated)</Label>
                <Input
                  id="score"
                  type="number"
                  step="0.01"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="Calculated from rating"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated based on rating and weightage. You can override if needed.
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

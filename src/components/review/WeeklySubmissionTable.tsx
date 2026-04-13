import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Clock, Loader2, Lock, AlertTriangle, Paperclip } from 'lucide-react';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { SubPeriodSubmission, useSubmitSubPeriod } from '@/hooks/useSubPeriodSubmissions';
import { getWeeklySubPeriods, WEEKLY_REVIEW_WINDOWS } from '@/lib/frequencyUtils';
import { QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';
import { QualitativeSelect } from './QualitativeSelect';
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
import { Label } from '@/components/ui/label';

interface WeeklySubmissionTableProps {
  kpiId: string;
  kpiName?: string | null;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  targetValue?: number | null;
  uom?: string | null;
  uomType?: string | null;
  qualitativeOptions?: QualitativeOption[] | null;
  onSubmissionComplete?: () => void;
  requireResubmitReason?: boolean;
}

interface WeekEntry {
  weekNum: number;
  label: string;
  achieved_value: string;
  remarks: string;
  isSubmitted: boolean;
  isResubmitted: boolean;
  submissionId?: string;
  canSubmit: boolean;
  reviewWindow: string;
  submittedAt?: string;
  evidenceUrls: string[];
}

export function WeeklySubmissionTable({
  kpiId,
  kpiName,
  reviewMonth,
  reviewYear,
  submissions,
  targetValue,
  uom,
  uomType,
  qualitativeOptions,
  onSubmissionComplete,
  requireResubmitReason = true,
}: WeeklySubmissionTableProps) {
  const submitSubPeriod = useSubmitSubPeriod();
  const { user } = useAuth();
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [tempRating, setTempRating] = useState<number | null>(null);
  const [tempRemarks, setTempRemarks] = useState<string>('');
  const [tempEvidenceUrls, setTempEvidenceUrls] = useState<string[]>([]);

  // Resubmission confirmation state
  const [confirmEditEntry, setConfirmEditEntry] = useState<WeekEntry | null>(null);
  const [updateReason, setUpdateReason] = useState<string>('');
  const [pendingUpdateReason, setPendingUpdateReason] = useState<string>('');

  const isQualitative = uomType === 'binary' || uomType === 'tiered';

  const currentDate = new Date();

  // Build week entries
  const weekEntries = useMemo((): WeekEntry[] => {
    const availableWeeks = getWeeklySubPeriods(currentDate, reviewMonth, reviewYear);
    
    return availableWeeks.map(week => {
      const weekNum = parseInt(week.value);
      const submission = submissions.find(s => s.sub_period_value === week.value);
      const windowKey = `week_${weekNum}` as keyof typeof WEEKLY_REVIEW_WINDOWS;
      const window = WEEKLY_REVIEW_WINDOWS[windowKey];
      
      return {
        weekNum,
        label: week.label,
        achieved_value: submission?.achieved_value != null ? submission.achieved_value.toString() : '',
        remarks: submission?.remarks || '',
        isSubmitted: !!submission,
        isResubmitted: submission?.is_resubmitted || false,
        submissionId: submission?.id,
        canSubmit: week.isEnabled,
        reviewWindow: window 
          ? `${window.start}-${window.end}${window.nextMonth ? ' (next month)' : ''}`
          : '',
        submittedAt: submission?.submitted_at || undefined,
        evidenceUrls: (submission?.evidence_urls as string[] | null) || [],
      };
    });
  }, [submissions, reviewMonth, reviewYear, currentDate.toDateString()]);

  // Helper to display achieved value for qualitative KPIs
  const getDisplayValue = (entry: WeekEntry) => {
    if (!entry.achieved_value) return '-';
    if (isQualitative) {
      // Use stored qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
      const options = qualitativeOptions?.length 
        ? qualitativeOptions 
        : (uomType === 'binary' ? BINARY_OPTIONS : []);
      const numVal = parseFloat(entry.achieved_value);
      if (!isNaN(numVal)) {
        const match = options.find(o => o.rating === numVal);
        if (match) return match.label;
      }
      const labelMatch = options.find(o => o.label === entry.achieved_value);
      if (labelMatch) return labelMatch.label;
      return entry.achieved_value;
    }
    return `${entry.achieved_value} ${uom || ''}`;
  };

  const handleStartEdit = (entry: WeekEntry) => {
    if (!entry.canSubmit) return;
    
    // If already resubmitted, no further edits allowed
    if (entry.isResubmitted) return;
    
    // If already submitted and require reason is enabled, show confirmation dialog
    if (entry.isSubmitted && requireResubmitReason) {
      setConfirmEditEntry(entry);
      setPendingUpdateReason('');
      return;
    }
    
    // Otherwise, proceed directly
    startEditing(entry, '');
  };

  const startEditing = (entry: WeekEntry, reason: string) => {
    setEditingWeek(entry.weekNum);
    setTempValue(entry.achieved_value);
    setTempRemarks(entry.remarks);
    setTempEvidenceUrls(entry.evidenceUrls);
    setUpdateReason(reason);
    
    // For qualitative, try to find matching rating
    if (isQualitative && entry.achieved_value) {
      // Use stored qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
      const options = qualitativeOptions?.length 
        ? qualitativeOptions 
        : (uomType === 'binary' ? BINARY_OPTIONS : []);
      const match = options.find(o => o.label === entry.achieved_value);
      setTempRating(match?.rating ?? null);
    } else {
      setTempRating(null);
    }
  };

  const handleConfirmEdit = () => {
    if (confirmEditEntry && pendingUpdateReason.trim()) {
      startEditing(confirmEditEntry, pendingUpdateReason.trim());
      setConfirmEditEntry(null);
      setPendingUpdateReason('');
    }
  };

  const handleCancelConfirmEdit = () => {
    setConfirmEditEntry(null);
    setPendingUpdateReason('');
  };

  const handleQualitativeChange = (value: string, rating: number) => {
    setTempValue(value);
    setTempRating(rating);
  };

  const handleSave = async (entry: WeekEntry) => {
    // For qualitative KPIs, store the rating as achieved_value
    const value = isQualitative 
      ? tempRating 
      : (tempValue ? parseFloat(tempValue) : null);
    
    await submitSubPeriod.mutateAsync({
      kpi_id: kpiId,
      sub_period_type: 'weekly',
      sub_period_value: entry.weekNum.toString(),
      achieved_value: value,
      remarks: tempRemarks || null,
      evidence_urls: tempEvidenceUrls,
      review_month: reviewMonth,
      review_year: reviewYear,
      update_reason: updateReason || null,
      is_resubmission: entry.isSubmitted,
    });
    
    setEditingWeek(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    setTempEvidenceUrls([]);
    setUpdateReason('');
    onSubmissionComplete?.();
  };

  const handleCancel = () => {
    setEditingWeek(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    setTempEvidenceUrls([]);
    setUpdateReason('');
  };

  // Calculate aggregated score
  const submittedEntries = weekEntries.filter(e => e.isSubmitted && e.achieved_value);
  const aggregatedScore = submittedEntries.length > 0
    ? submittedEntries.reduce((sum, e) => sum + parseFloat(e.achieved_value), 0) / submittedEntries.length
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Weekly Submissions - {reviewMonth} {reviewYear}</span>
        </div>
        {aggregatedScore !== null && (
          <Badge variant="secondary">
            Monthly Avg: {aggregatedScore.toFixed(2)} {uom || ''}
          </Badge>
        )}
      </div>
      
      {targetValue && (
        <p className="text-sm text-muted-foreground">
          Target: {targetValue} {uom || ''} per week
        </p>
      )}

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>Review Window</TableHead>
              <TableHead>Achieved Value</TableHead>
              <TableHead className="hidden md:table-cell">Remarks</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[80px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weekEntries.map((entry) => (
              <TableRow 
                key={entry.weekNum}
                className={!entry.canSubmit ? 'opacity-50' : ''}
              >
                <TableCell className="font-medium">
                  Week {entry.weekNum}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {entry.reviewWindow}
                  </span>
                </TableCell>
                <TableCell>
                  {editingWeek === entry.weekNum ? (
                    isQualitative ? (
                      <QualitativeSelect
                        uomType={uomType as 'binary' | 'tiered'}
                        qualitativeOptions={qualitativeOptions || null}
                        value={tempValue || null}
                        onChange={handleQualitativeChange}
                        placeholder="Select..."
                      />
                    ) : (
                      <Input
                        type="number"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        placeholder="Enter value..."
                        className="w-32"
                      />
                    )
                  ) : (
                    <span>{getDisplayValue(entry)}</span>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {editingWeek === entry.weekNum ? (
                    <div className="space-y-2">
                      <Textarea
                        value={tempRemarks}
                        onChange={(e) => setTempRemarks(e.target.value)}
                        placeholder="Optional remarks..."
                        className="min-h-[60px]"
                      />
                      {user && (
                        <MultiFileUpload
                          userId={user.id}
                          contextId={kpiId}
                          folder="weekly-evidence"
                          existingUrls={tempEvidenceUrls}
                          onUploadComplete={setTempEvidenceUrls}
                          maxFiles={5}
                          label="Supporting Documents"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground line-clamp-2">
                        {entry.remarks || '-'}
                      </span>
                      {entry.evidenceUrls.length > 0 && (
                        <button
                          type="button"
                          onClick={() => entry.evidenceUrls.forEach((url, i) => openStorageFile(url, buildEvidenceFileName(url, null, kpiName, `Week_${entry.weekNum}`, i, entry.evidenceUrls.length)))}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline shrink-0"
                          title={`${entry.evidenceUrls.length} file(s) attached`}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-xs">{entry.evidenceUrls.length}</span>
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {entry.isResubmitted ? (
                    <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                      <Lock className="h-3 w-3" />
                      Final
                    </Badge>
                  ) : entry.isSubmitted ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" />
                      Done
                    </Badge>
                  ) : entry.canSubmit ? (
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      Open
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Closed
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {editingWeek === entry.weekNum ? (
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        onClick={() => handleSave(entry)}
                        disabled={submitSubPeriod.isPending}
                      >
                        {submitSubPeriod.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={handleCancel}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : entry.canSubmit && !entry.isResubmitted ? (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleStartEdit(entry)}
                    >
                      {entry.isSubmitted ? 'Edit' : 'Enter'}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Each week has a specific review window. You can only submit data during that period.
        </p>
        <p>
          The monthly score is calculated as the average of all weekly submissions.
        </p>
      </div>

      {/* Resubmission Confirmation Dialog */}
      <AlertDialog open={!!confirmEditEntry} onOpenChange={(open) => !open && handleCancelConfirmEdit()}>
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
                <p>
                  Current submission for <strong>Week {confirmEditEntry?.weekNum}</strong>:
                </p>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p><strong>Current Value:</strong> {confirmEditEntry ? getDisplayValue(confirmEditEntry) : '-'}</p>
                  {confirmEditEntry?.submittedAt && (
                    <p><strong>Submitted On:</strong> {format(new Date(confirmEditEntry.submittedAt), 'dd MMM yyyy, hh:mm a')}</p>
                  )}
                  {confirmEditEntry?.remarks && (
                    <p><strong>Remarks:</strong> {confirmEditEntry.remarks}</p>
                  )}
                </div>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="update-reason-weekly" className="text-foreground">
                    Reason for Update <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="update-reason-weekly"
                    value={pendingUpdateReason}
                    onChange={(e) => setPendingUpdateReason(e.target.value)}
                    placeholder="Enter reason for modifying this submission..."
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    This reason will be logged for audit purposes.
                  </p>
                </div>
                <p className="text-sm font-medium text-foreground">
                  Are you sure you want to re-submit?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirmEdit}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmEdit}
              disabled={!pendingUpdateReason.trim()}
            >
              Confirm & Re-submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

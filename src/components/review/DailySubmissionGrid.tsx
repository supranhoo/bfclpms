import { useMemo, useState } from 'react';
import { format, parseISO, getDaysInMonth } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Calendar, Loader2, Lock, AlertTriangle, Paperclip } from 'lucide-react';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { useAuth } from '@/contexts/AuthContext';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { SubPeriodSubmission, useSubmitSubPeriod } from '@/hooks/useSubPeriodSubmissions';
import { getDailySubPeriods, getMonthNumber, canSubmitForSubPeriod } from '@/lib/frequencyUtils';
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

interface DailySubmissionGridProps {
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

interface DayEntry {
  date: string;
  day: number;
  achieved_value: string;
  remarks: string;
  isSubmitted: boolean;
  isResubmitted: boolean;
  submissionId?: string;
  canSubmit: boolean;
  submittedAt?: string;
  evidenceUrls: string[];
}

export function DailySubmissionGrid({
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
}: DailySubmissionGridProps) {
  const submitSubPeriod = useSubmitSubPeriod();
  const { user } = useAuth();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [tempRating, setTempRating] = useState<number | null>(null);
  const [tempRemarks, setTempRemarks] = useState<string>('');
  const [tempEvidenceUrls, setTempEvidenceUrls] = useState<string[]>([]);
  
  // Resubmission confirmation state
  const [confirmEditEntry, setConfirmEditEntry] = useState<DayEntry | null>(null);
  const [updateReason, setUpdateReason] = useState<string>('');
  const [pendingUpdateReason, setPendingUpdateReason] = useState<string>('');

  const isQualitative = uomType === 'binary' || uomType === 'tiered';

  const currentDate = new Date();
  const daysInMonth = getDaysInMonth(new Date(reviewYear, getMonthNumber(reviewMonth) - 1));

  // Build day entries for the month
  const dayEntries = useMemo((): DayEntry[] => {
    const entries: DayEntry[] = [];
    const availableDates = getDailySubPeriods(currentDate, reviewMonth, reviewYear);
    const availableDateValues = availableDates.map(d => d.value);
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${reviewYear}-${String(getMonthNumber(reviewMonth)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const submission = submissions.find(s => s.sub_period_value === dateStr);
      
      entries.push({
        date: dateStr,
        day,
        achieved_value: submission?.achieved_value?.toString() || '',
        remarks: submission?.remarks || '',
        isSubmitted: !!submission,
        isResubmitted: submission?.is_resubmitted || false,
        submissionId: submission?.id,
        canSubmit: availableDateValues.includes(dateStr),
        submittedAt: submission?.submitted_at || undefined,
        evidenceUrls: (submission?.evidence_urls as string[] | null) || [],
      });
    }
    
    return entries;
  }, [submissions, daysInMonth, reviewMonth, reviewYear, currentDate.toDateString()]);

  // Helper to display achieved value for qualitative KPIs
  const getDisplayValue = (entry: DayEntry) => {
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

  const handleStartEdit = (entry: DayEntry) => {
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

  const startEditing = (entry: DayEntry, reason: string) => {
    setEditingDay(entry.day);
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
      const numVal = parseFloat(entry.achieved_value);
      
      // First try to match by rating (achieved_value is stored as a number)
      if (!isNaN(numVal)) {
        const matchByRating = options.find(o => o.rating === numVal);
        if (matchByRating) {
          setTempValue(matchByRating.label);
          setTempRating(matchByRating.rating);
          return;
        }
      }
      
      // Fallback: try to match by label
      const matchByLabel = options.find(o => o.label === entry.achieved_value);
      if (matchByLabel) {
        setTempValue(matchByLabel.label);
        setTempRating(matchByLabel.rating);
        return;
      }
      
      // No match found
      setTempRating(null);
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

  const handleSave = async (entry: DayEntry) => {
    // For qualitative KPIs, store the rating as achieved_value
    const value = isQualitative 
      ? tempRating 
      : (tempValue ? parseFloat(tempValue) : null);
    
    await submitSubPeriod.mutateAsync({
      kpi_id: kpiId,
      sub_period_type: 'daily',
      sub_period_value: entry.date,
      achieved_value: value,
      remarks: tempRemarks || null,
      evidence_urls: tempEvidenceUrls,
      review_month: reviewMonth,
      review_year: reviewYear,
      update_reason: updateReason || null,
      is_resubmission: entry.isSubmitted,
    });
    
    setEditingDay(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    setTempEvidenceUrls([]);
    setUpdateReason('');
    onSubmissionComplete?.();
  };

  const handleCancel = () => {
    setEditingDay(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    setTempEvidenceUrls([]);
    setUpdateReason('');
  };

  // Calculate aggregated score
  const submittedEntries = dayEntries.filter(e => e.isSubmitted && e.achieved_value);
  const aggregatedScore = submittedEntries.length > 0
    ? submittedEntries.reduce((sum, e) => sum + parseFloat(e.achieved_value), 0) / submittedEntries.length
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Daily Submissions - {reviewMonth} {reviewYear}</span>
        </div>
        {aggregatedScore !== null && (
          <Badge variant="secondary">
            Monthly Avg: {aggregatedScore.toFixed(2)} {uom || ''}
          </Badge>
        )}
      </div>
      
      {targetValue && (
        <p className="text-sm text-muted-foreground">
          Target: {targetValue} {uom || ''} per day
        </p>
      )}

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Achieved Value</TableHead>
              <TableHead className="hidden md:table-cell">Remarks</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[80px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dayEntries.map((entry) => (
              <TableRow 
                key={entry.day} 
                className={!entry.canSubmit ? 'opacity-50' : ''}
              >
                <TableCell className="font-medium">
                  {entry.day} {reviewMonth.slice(0, 3)}
                </TableCell>
                <TableCell>
                  {editingDay === entry.day ? (
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
                  {editingDay === entry.day ? (
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
                          folder="daily-evidence"
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
                          onClick={() => entry.evidenceUrls.forEach((url, i) => openStorageFile(url, buildEvidenceFileName(url, null, kpiName, `Day_${entry.day}`, i, entry.evidenceUrls.length)))}
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
                    <Badge variant="outline">Pending</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Closed
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {editingDay === entry.day ? (
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
      
      <p className="text-xs text-muted-foreground">
        You can only submit data for today and yesterday. The monthly score is calculated as the average of all daily submissions.
      </p>

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
                  Current submission for <strong>{confirmEditEntry?.day} {reviewMonth}</strong>:
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
                  <Label htmlFor="update-reason" className="text-foreground">
                    Reason for Update <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="update-reason"
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

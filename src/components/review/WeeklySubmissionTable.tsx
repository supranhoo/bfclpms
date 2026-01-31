import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Clock, Loader2 } from 'lucide-react';
import { SubPeriodSubmission, useSubmitSubPeriod } from '@/hooks/useSubPeriodSubmissions';
import { getWeeklySubPeriods, WEEKLY_REVIEW_WINDOWS } from '@/lib/frequencyUtils';
import { QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';
import { QualitativeSelect } from './QualitativeSelect';

interface WeeklySubmissionTableProps {
  kpiId: string;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  targetValue?: number | null;
  uom?: string | null;
  uomType?: string | null;
  qualitativeOptions?: QualitativeOption[] | null;
  onSubmissionComplete?: () => void;
}

interface WeekEntry {
  weekNum: number;
  label: string;
  achieved_value: string;
  remarks: string;
  isSubmitted: boolean;
  submissionId?: string;
  canSubmit: boolean;
  reviewWindow: string;
}

export function WeeklySubmissionTable({
  kpiId,
  reviewMonth,
  reviewYear,
  submissions,
  targetValue,
  uom,
  uomType,
  qualitativeOptions,
  onSubmissionComplete,
}: WeeklySubmissionTableProps) {
  const submitSubPeriod = useSubmitSubPeriod();
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [tempRating, setTempRating] = useState<number | null>(null);
  const [tempRemarks, setTempRemarks] = useState<string>('');

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
        achieved_value: submission?.achieved_value?.toString() || '',
        remarks: submission?.remarks || '',
        isSubmitted: !!submission,
        submissionId: submission?.id,
        canSubmit: week.isEnabled,
        reviewWindow: window 
          ? `${window.start}-${window.end}${window.nextMonth ? ' (next month)' : ''}`
          : '',
      };
    });
  }, [submissions, reviewMonth, reviewYear, currentDate.toDateString()]);

  const handleStartEdit = (entry: WeekEntry) => {
    if (!entry.canSubmit) return;
    setEditingWeek(entry.weekNum);
    setTempValue(entry.achieved_value);
    setTempRemarks(entry.remarks);
    // For qualitative, try to find matching rating
    if (isQualitative && entry.achieved_value) {
      const options = uomType === 'binary' ? BINARY_OPTIONS : (qualitativeOptions || []);
      const match = options.find(o => o.label === entry.achieved_value);
      setTempRating(match?.rating ?? null);
    } else {
      setTempRating(null);
    }
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
      review_month: reviewMonth,
      review_year: reviewYear,
    });
    
    setEditingWeek(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    onSubmissionComplete?.();
  };

  const handleCancel = () => {
    setEditingWeek(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
  };

  // Helper to display achieved value for qualitative KPIs
  const getDisplayValue = (entry: WeekEntry) => {
    if (!entry.achieved_value) return '-';
    if (isQualitative) {
      const options = uomType === 'binary' ? BINARY_OPTIONS : (qualitativeOptions || []);
      const numVal = parseFloat(entry.achieved_value);
      // Check if stored as rating number
      if (!isNaN(numVal)) {
        const match = options.find(o => o.rating === numVal);
        if (match) return match.label;
      }
      // Check if stored as label
      const labelMatch = options.find(o => o.label === entry.achieved_value);
      if (labelMatch) return labelMatch.label;
      return entry.achieved_value;
    }
    return `${entry.achieved_value} ${uom || ''}`;
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
                    <Textarea
                      value={tempRemarks}
                      onChange={(e) => setTempRemarks(e.target.value)}
                      placeholder="Optional remarks..."
                      className="min-h-[60px]"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground line-clamp-2">
                      {entry.remarks || '-'}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {entry.isSubmitted ? (
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
                  ) : entry.canSubmit ? (
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
    </div>
  );
}

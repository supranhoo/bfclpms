import { useMemo, useState } from 'react';
import { format, parseISO, getDaysInMonth } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, Calendar, Loader2 } from 'lucide-react';
import { SubPeriodSubmission, useSubmitSubPeriod } from '@/hooks/useSubPeriodSubmissions';
import { getDailySubPeriods, getMonthNumber, canSubmitForSubPeriod } from '@/lib/frequencyUtils';
import { QualitativeOption, BINARY_OPTIONS, scoreToRatingLevel } from '@/lib/qualitativeUom';
import { QualitativeSelect } from './QualitativeSelect';

interface DailySubmissionGridProps {
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

interface DayEntry {
  date: string;
  day: number;
  achieved_value: string;
  remarks: string;
  isSubmitted: boolean;
  submissionId?: string;
  canSubmit: boolean;
}

export function DailySubmissionGrid({
  kpiId,
  reviewMonth,
  reviewYear,
  submissions,
  targetValue,
  uom,
  uomType,
  qualitativeOptions,
  onSubmissionComplete,
}: DailySubmissionGridProps) {
  const submitSubPeriod = useSubmitSubPeriod();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [tempRating, setTempRating] = useState<number | null>(null);
  const [tempRemarks, setTempRemarks] = useState<string>('');

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
        submissionId: submission?.id,
        canSubmit: availableDateValues.includes(dateStr),
      });
    }
    
    return entries;
  }, [submissions, daysInMonth, reviewMonth, reviewYear, currentDate.toDateString()]);

  const handleStartEdit = (entry: DayEntry) => {
    if (!entry.canSubmit) return;
    setEditingDay(entry.day);
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
      review_month: reviewMonth,
      review_year: reviewYear,
    });
    
    setEditingDay(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
    onSubmissionComplete?.();
  };

  const handleCancel = () => {
    setEditingDay(null);
    setTempValue('');
    setTempRating(null);
    setTempRemarks('');
  };

  // Helper to display achieved value for qualitative KPIs
  const getDisplayValue = (entry: DayEntry) => {
    if (!entry.achieved_value) return '-';
    if (isQualitative) {
      // For qualitative, the value stored might be a label or a rating number
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
      
      <p className="text-xs text-muted-foreground">
        You can only submit data for today and yesterday. The monthly score is calculated as the average of all daily submissions.
      </p>
    </div>
  );
}

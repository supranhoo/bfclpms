import React, { useMemo } from 'react';
import { format, getDaysInMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Check, X, RotateCcw, ArrowRight } from 'lucide-react';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { getMonthNumber } from '@/lib/frequencyUtils';
import { calculateBinaryDailyScore, BinaryAggregationResult } from '@/lib/dailyAggregation';

interface ManagerDailyOverrideEditorProps {
  kpiId: string;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  overrides: Map<string, number>;
  onOverridesChange: (overrides: Map<string, number>) => void;
  overrideReason: string;
  onReasonChange: (reason: string) => void;
  originalScore: number | null;
}

interface DayEntry {
  date: string;
  dateFormatted: string;
  dayNumber: number;
  originalValue: number | null;
  currentValue: number | null;
  hasOverride: boolean;
  isMissing: boolean;
}

// Score to rating label mapping
const getScoreLabel = (score: number): string => {
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

// Score badge color
const getScoreBadgeClass = (score: number): string => {
  if (score >= 4) return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
  if (score >= 3) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
  if (score >= 2) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
};

export function ManagerDailyOverrideEditor({
  kpiId,
  reviewMonth,
  reviewYear,
  submissions,
  overrides,
  onOverridesChange,
  overrideReason,
  onReasonChange,
  originalScore,
}: ManagerDailyOverrideEditorProps) {
  // Build day entries for the month
  const dayEntries = useMemo((): DayEntry[] => {
    const monthNumber = getMonthNumber(reviewMonth);
    const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
    
    // Create a map of date -> submission
    const submissionMap = new Map<string, SubPeriodSubmission>();
    submissions.forEach(s => {
      submissionMap.set(s.sub_period_value, s);
    });
    
    const entries: DayEntry[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(reviewYear, monthNumber - 1, day);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const submission = submissionMap.get(dateStr);
      const override = overrides.get(dateStr);
      
      entries.push({
        date: dateStr,
        dateFormatted: format(dateObj, 'dd MMM'),
        dayNumber: day,
        originalValue: submission?.achieved_value ?? null,
        currentValue: override !== undefined ? override : (submission?.achieved_value ?? null),
        hasOverride: override !== undefined,
        isMissing: !submission,
      });
    }
    
    return entries;
  }, [reviewMonth, reviewYear, submissions, overrides]);

  // Calculate recalculated score based on overrides
  const recalculatedResult = useMemo((): BinaryAggregationResult => {
    // Build the final values array with overrides applied
    const monthNumber = getMonthNumber(reviewMonth);
    const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
    
    const values: number[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(reviewYear, monthNumber - 1, day);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const override = overrides.get(dateStr);
      const submission = submissions.find(s => s.sub_period_value === dateStr);
      
      if (override !== undefined) {
        // Manager has set an override for this day
        values.push(override);
      } else if (submission !== null && submission !== undefined) {
        // Use original submission value
        values.push(submission.achieved_value ?? 0);
      }
      // If no override and no submission, it's counted as missed (not in values array)
    }
    
    return calculateBinaryDailyScore(values, reviewMonth, reviewYear);
  }, [submissions, overrides, reviewMonth, reviewYear]);

  // Stats
  const overrideCount = overrides.size;
  const changedFromYes = dayEntries.filter(e => e.originalValue === 5 && overrides.get(e.date) === 0).length;
  const changedFromNo = dayEntries.filter(e => e.originalValue === 0 && overrides.get(e.date) === 5).length;
  const filledMissing = dayEntries.filter(e => e.isMissing && overrides.has(e.date)).length;

  // Handle override change
  const handleOverrideChange = (date: string, value: string) => {
    const newOverrides = new Map(overrides);
    
    if (value === 'keep') {
      // Remove override - use original value
      newOverrides.delete(date);
    } else {
      // Set override value (0 for No, 5 for Yes)
      newOverrides.set(date, parseInt(value, 10));
    }
    
    onOverridesChange(newOverrides);
  };

  // Reset all overrides
  const handleResetAll = () => {
    onOverridesChange(new Map());
  };

  // Mark all missing days as No
  const handleMarkAllMissingNo = () => {
    const newOverrides = new Map(overrides);
    dayEntries.forEach(entry => {
      if (entry.isMissing) {
        newOverrides.set(entry.date, 0);
      }
    });
    onOverridesChange(newOverrides);
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Manager Override Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bulk Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllMissingNo}
            disabled={dayEntries.filter(e => e.isMissing && !overrides.has(e.date)).length === 0}
          >
            <X className="h-3 w-3 mr-1" />
            Mark all missing as No
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAll}
            disabled={overrides.size === 0}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset overrides
          </Button>
        </div>

        {/* Override Table */}
        <ScrollArea className="h-[200px] rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Date</TableHead>
                <TableHead>Current Value</TableHead>
                <TableHead>Manager Override</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dayEntries.map((entry) => {
                const selectValue = entry.hasOverride 
                  ? entry.currentValue?.toString() || '0'
                  : 'keep';
                
                return (
                  <TableRow 
                    key={entry.date}
                    className={entry.hasOverride ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
                  >
                    <TableCell className="font-medium">{entry.dateFormatted}</TableCell>
                    <TableCell>
                      {entry.isMissing ? (
                        <span className="text-muted-foreground italic">(missing)</span>
                      ) : entry.originalValue === 5 ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Yes
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                          <X className="h-3 w-3" /> No
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={selectValue}
                        onValueChange={(val) => handleOverrideChange(entry.date, val)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {!entry.isMissing && (
                            <SelectItem value="keep">
                              {entry.originalValue === 5 ? 'Yes (keep)' : 'No (keep)'}
                            </SelectItem>
                          )}
                          <SelectItem value="5">Yes</SelectItem>
                          <SelectItem value="0">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.hasOverride ? (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {entry.isMissing ? 'Filled' : 'Changed'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Recalculated Score Preview */}
        <div className="p-4 bg-muted rounded-lg space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Original Score:</span>
            <Badge className={getScoreBadgeClass(originalScore || 0)}>
              {originalScore ?? '—'} - {getScoreLabel(originalScore || 0)}
            </Badge>
          </div>
          <div className="flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center justify-between text-sm font-medium">
            <span>New Score:</span>
            <Badge className={getScoreBadgeClass(recalculatedResult.score || 0)}>
              {recalculatedResult.score ?? '—'} - {getScoreLabel(recalculatedResult.score || 0)}
            </Badge>
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            <p>Total No: {recalculatedResult.totalNoCount} (Missed: {recalculatedResult.missedDays}, No entries: {recalculatedResult.noSubmissions})</p>
            {overrideCount > 0 && (
              <p className="text-amber-600 dark:text-amber-400">
                Changes: {overrideCount} date(s) modified
                {changedFromYes > 0 && ` (${changedFromYes} Yes→No)`}
                {changedFromNo > 0 && ` (${changedFromNo} No→Yes)`}
                {filledMissing > 0 && ` (${filledMissing} filled)`}
              </p>
            )}
          </div>
        </div>

        {/* Mandatory Reason */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Reason for Override <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={overrideReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g., Verified HRMS logs and found employee was absent on specific dates..."
            rows={2}
            className={!overrideReason.trim() ? 'border-destructive' : ''}
          />
          {!overrideReason.trim() && (
            <p className="text-xs text-destructive">Reason is required when overriding daily entries</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Export the recalculated score calculation for use in parent component
export function calculateOverriddenScore(
  submissions: SubPeriodSubmission[],
  overrides: Map<string, number>,
  reviewMonth: string,
  reviewYear: number
): BinaryAggregationResult {
  const monthNumber = getMonthNumber(reviewMonth);
  const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
  
  const values: number[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(reviewYear, monthNumber - 1, day);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const override = overrides.get(dateStr);
    const submission = submissions.find(s => s.sub_period_value === dateStr);
    
    if (override !== undefined) {
      values.push(override);
    } else if (submission !== null && submission !== undefined) {
      values.push(submission.achieved_value ?? 0);
    }
  }
  
  return calculateBinaryDailyScore(values, reviewMonth, reviewYear);
}

import { useMemo } from 'react';
import { format, getDaysInMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Check, X, Lock, AlertTriangle, Edit2 } from 'lucide-react';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { QualitativeOption, BINARY_OPTIONS } from '@/lib/qualitativeUom';
import { getMonthNumber } from '@/lib/frequencyUtils';

interface DailySubmissionSummaryProps {
  kpiId: string;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  uom?: string | null;
  uomType?: string | null;
  qualitativeOptions?: QualitativeOption[] | null;
  compact?: boolean; // Inline display mode with reduced styling
  // Manager override display props
  managerOverrides?: Map<string, number>; // date -> new value
}

export function DailySubmissionSummary({
  kpiId,
  reviewMonth,
  reviewYear,
  submissions,
  uom,
  uomType,
  qualitativeOptions,
  compact = false,
  managerOverrides,
}: DailySubmissionSummaryProps) {
  // Calculate stats
  const stats = useMemo(() => {
    const monthNumber = getMonthNumber(reviewMonth);
    const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
    
    // Count all submissions (regardless of achieved_value)
    const submittedCount = submissions.length;
    const missingCount = daysInMonth - submittedCount;
    
    // For binary KPIs, count "No" values (rating = 0)
    const isBinary = uomType === 'binary';
    const noCount = isBinary 
      ? submissions.filter(s => s.achieved_value === 0).length 
      : 0;
    
    // Total No = missed days + explicit "No" submissions (for binary KPIs)
    const totalNoCount = missingCount + noCount;
    
    return { daysInMonth, submittedCount, missingCount, noCount, isBinary, totalNoCount };
  }, [submissions, reviewMonth, reviewYear, uomType]);

  // Format achieved value for display
  const formatAchievedValue = (value: number | null): string => {
    if (value === null) return '—';
    
    if (uomType === 'binary') {
      const option = BINARY_OPTIONS.find(o => o.rating === value);
      return option?.label || value.toString();
    }
    
    if (uomType === 'tiered' && qualitativeOptions) {
      const option = qualitativeOptions.find(o => o.rating === value);
      return option?.label || value.toString();
    }
    
    // Numeric value
    return uom ? `${value} ${uom}` : value.toString();
  };

  // Check if value is "No" (for binary KPIs)
  const isNoValue = (value: number | null): boolean => {
    return uomType === 'binary' && value === 0;
  };

  // Sort submissions by date (show ALL submissions, not just ones with values)
  const sortedSubmissions = useMemo(() => {
    return [...submissions]
      .sort((a, b) => {
        // Parse full date strings properly (YYYY-MM-DD format)
        const dateA = new Date(a.sub_period_value).getTime();
        const dateB = new Date(b.sub_period_value).getTime();
        return dateA - dateB;
      });
  }, [submissions]);

  // Don't render if no submissions
  if (sortedSubmissions.length === 0) {
    return null;
  }

  // Compact mode: no Card wrapper, smaller spacing
  const content = (
    <>
      {/* Stats Row */}
      <div className={`grid grid-cols-4 ${compact ? 'gap-2' : 'gap-3'}`}>
        <div className={`${compact ? 'p-2' : 'p-3'} bg-muted/50 rounded-lg text-center`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <Calendar className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground`} />
          </div>
          <p className={`${compact ? 'text-lg' : 'text-xl'} font-bold`}>{stats.daysInMonth}</p>
          <p className="text-xs text-muted-foreground">Total Days</p>
        </div>
        <div className={`${compact ? 'p-2' : 'p-3'} bg-green-50 dark:bg-green-950/30 rounded-lg text-center`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <Check className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-green-600 dark:text-green-400`} />
          </div>
          <p className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-green-600 dark:text-green-400`}>{stats.submittedCount}</p>
          <p className="text-xs text-muted-foreground">Submitted</p>
        </div>
        <div className={`${compact ? 'p-2' : 'p-3'} bg-amber-50 dark:bg-amber-950/30 rounded-lg text-center`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <X className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-amber-600 dark:text-amber-400`} />
          </div>
          <p className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-amber-600 dark:text-amber-400`}>{stats.missingCount}</p>
          <p className="text-xs text-muted-foreground">Not Submitted</p>
        </div>
        {stats.isBinary && (
          <div className={`${compact ? 'p-2' : 'p-3'} bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-orange-600 dark:text-orange-400`} />
            </div>
            <p className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-orange-600 dark:text-orange-400`}>{stats.totalNoCount}</p>
            <p className="text-xs text-muted-foreground">Total No</p>
          </div>
        )}
        {!stats.isBinary && (
          <div className={`${compact ? 'p-2' : 'p-3'} bg-muted/50 rounded-lg text-center`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <Check className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground`} />
            </div>
            <p className={`${compact ? 'text-lg' : 'text-xl'} font-bold`}>
              {stats.daysInMonth > 0 
                ? Math.round((stats.submittedCount / stats.daysInMonth) * 100) 
                : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Completion</p>
          </div>
        )}
      </div>

      {/* Submissions Table */}
      <ScrollArea className={`${compact ? 'h-[150px]' : 'h-[200px]'} rounded-md border mt-3`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Achieved Value</TableHead>
              <TableHead className="text-right">Submitted At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {sortedSubmissions.map((submission) => {
              // Parse full date string directly (YYYY-MM-DD format)
              const dateObj = new Date(submission.sub_period_value);
              const formattedDate = format(dateObj, 'dd MMM');
              const formattedTimestamp = submission.submitted_at 
                ? format(new Date(submission.submitted_at), 'dd MMM yyyy, hh:mm a')
                : '—';
              const isNo = isNoValue(submission.achieved_value);
              const hasOverride = managerOverrides?.has(submission.sub_period_value);
              const overrideValue = hasOverride ? managerOverrides?.get(submission.sub_period_value) : null;
              const isOverrideChanged = hasOverride && overrideValue !== submission.achieved_value;
              
              return (
                <TableRow 
                  key={submission.id}
                  className={
                    isOverrideChanged 
                      ? 'bg-amber-50/50 dark:bg-amber-950/20' 
                      : isNo 
                        ? 'bg-red-50/50 dark:bg-red-950/20' 
                        : ''
                  }
                >
                  <TableCell className="font-medium">{formattedDate}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isOverrideChanged ? (
                        <>
                          {/* Original value with strikethrough */}
                          <span className="text-muted-foreground line-through text-sm">
                            {formatAchievedValue(submission.achieved_value)}
                          </span>
                          {/* Arrow */}
                          <span className="text-muted-foreground">→</span>
                          {/* Manager override value */}
                          <span className={overrideValue === 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                            {formatAchievedValue(overrideValue ?? null)}
                          </span>
                          <Badge variant="outline" className="text-xs h-5 px-1.5 gap-0.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                            <Edit2 className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                            <span className="text-amber-600 dark:text-amber-400">Override</span>
                          </Badge>
                        </>
                      ) : (
                        <>
                          <span className={isNo ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                            {formatAchievedValue(submission.achieved_value)}
                          </span>
                          {submission.is_resubmitted && (
                            <Badge variant="outline" className="text-xs h-5 px-1.5 gap-0.5 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                              <Lock className="h-3 w-3 text-green-600 dark:text-green-400" />
                              <span className="text-green-600 dark:text-green-400">Final</span>
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formattedTimestamp}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </>
  );

  // Compact mode: return content directly without Card wrapper
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          Daily Submission Summary
        </div>
        {content}
      </div>
    );
  }

  // Full mode: wrap in Card
  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Daily Submission Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
}

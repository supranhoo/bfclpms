import { useMemo } from 'react';
import { format, getDaysInMonth, parse } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Check, X, Ban, Lock } from 'lucide-react';
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
}

export function DailySubmissionSummary({
  kpiId,
  reviewMonth,
  reviewYear,
  submissions,
  uom,
  uomType,
  qualitativeOptions,
}: DailySubmissionSummaryProps) {
  // Calculate stats
  const stats = useMemo(() => {
    const monthNumber = getMonthNumber(reviewMonth);
    const daysInMonth = getDaysInMonth(new Date(reviewYear, monthNumber - 1));
    
    const submittedCount = submissions.filter(s => s.achieved_value !== null).length;
    const missingCount = daysInMonth - submittedCount;
    
    // For binary KPIs, count "No" values (rating = 0)
    const isBinary = uomType === 'binary';
    const noCount = isBinary 
      ? submissions.filter(s => s.achieved_value === 0).length 
      : 0;
    
    return { daysInMonth, submittedCount, missingCount, noCount, isBinary };
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

  // Sort submissions by date
  const sortedSubmissions = useMemo(() => {
    return [...submissions]
      .filter(s => s.achieved_value !== null)
      .sort((a, b) => {
        const dateA = parseInt(a.sub_period_value);
        const dateB = parseInt(b.sub_period_value);
        return dateA - dateB;
      });
  }, [submissions]);

  // Don't render if no submissions
  if (sortedSubmissions.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Daily Submission Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold">{stats.daysInMonth}</p>
            <p className="text-xs text-muted-foreground">Total Days</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.submittedCount}</p>
            <p className="text-xs text-muted-foreground">Submitted</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <X className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.missingCount}</p>
            <p className="text-xs text-muted-foreground">Not Submitted</p>
          </div>
          {stats.isBinary && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Ban className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.noCount}</p>
              <p className="text-xs text-muted-foreground">"No" Count</p>
            </div>
          )}
          {!stats.isBinary && (
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">
                {stats.daysInMonth > 0 
                  ? Math.round((stats.submittedCount / stats.daysInMonth) * 100) 
                  : 0}%
              </p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
          )}
        </div>

        {/* Submissions Table */}
        <ScrollArea className="h-[200px] rounded-md border">
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
                const dayNumber = parseInt(submission.sub_period_value);
                const monthNumber = getMonthNumber(reviewMonth);
                const dateObj = new Date(reviewYear, monthNumber - 1, dayNumber);
                const formattedDate = format(dateObj, 'dd MMM');
                const formattedTimestamp = submission.submitted_at 
                  ? format(new Date(submission.submitted_at), 'dd MMM yyyy, hh:mm a')
                  : '—';
                const isNo = isNoValue(submission.achieved_value);
                
                return (
                  <TableRow 
                    key={submission.id}
                    className={isNo ? 'bg-red-50/50 dark:bg-red-950/20' : ''}
                  >
                    <TableCell className="font-medium">{formattedDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={isNo ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                          {formatAchievedValue(submission.achieved_value)}
                        </span>
                        {submission.is_resubmitted && (
                          <Badge variant="outline" className="text-xs h-5 px-1.5 gap-0.5 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                            <Lock className="h-3 w-3 text-green-600 dark:text-green-400" />
                            <span className="text-green-600 dark:text-green-400">Final</span>
                          </Badge>
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
      </CardContent>
    </Card>
  );
}

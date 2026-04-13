import { useMemo } from 'react';
import { format, getDaysInMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Check, X, AlertTriangle, Edit2, Paperclip } from 'lucide-react';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { QualitativeOption, BINARY_OPTIONS } from '@/lib/qualitativeUom';
import { getMonthNumber } from '@/lib/frequencyUtils';
import { cn } from '@/lib/utils';

interface DailySubmissionSummaryProps {
  kpiId: string;
  kpiName?: string | null;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  uom?: string | null;
  uomType?: string | null;
  qualitativeOptions?: QualitativeOption[] | null;
  compact?: boolean;
  managerOverrides?: Map<string, number>;
  kpiStatus?: string | null;
}

// Reviewer column configuration
interface ReviewerColumn {
  key: 'achieved_value' | 'manager_achieved_value' | 'auditor_achieved_value' | 'management_achieved_value' | 'admin_achieved_value';
  label: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
}

// Full 8-stage status progression order for determining visible columns
const STATUS_ORDER = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'];

export function DailySubmissionSummary({
  kpiId,
  kpiName,
  reviewMonth,
  reviewYear,
  submissions,
  uom,
  uomType,
  qualitativeOptions,
  compact = false,
  managerOverrides,
  kpiStatus,
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

  // Determine which reviewer columns to show based on KPI status
  const visibleColumns = useMemo((): ReviewerColumn[] => {
    const cols: ReviewerColumn[] = [
      { key: 'achieved_value', label: 'Self (Employee)', shortLabel: 'Self', colorClass: '', bgClass: '' },
    ];
    
    const statusIndex = STATUS_ORDER.indexOf(kpiStatus || 'kra_set');
    
    // Show Manager column if KPI has passed manager_check or later
    if (statusIndex >= STATUS_ORDER.indexOf('manager_check')) {
      cols.push({ 
        key: 'manager_achieved_value', 
        label: 'Manager Approved', 
        shortLabel: 'Manager',
        colorClass: 'text-amber-600 dark:text-amber-400', 
        bgClass: 'bg-amber-50 dark:bg-amber-950/30' 
      });
    }

    // Show Skip-Level column if KPI has passed skip_level_check or later
    if (statusIndex >= STATUS_ORDER.indexOf('skip_level_check')) {
      cols.push({ 
        key: 'skip_level_achieved_value' as any, 
        label: 'Skip-Level Approved', 
        shortLabel: 'Skip-Lvl',
        colorClass: 'text-cyan-600 dark:text-cyan-400', 
        bgClass: 'bg-cyan-50 dark:bg-cyan-950/30' 
      });
    }

    // Show HR PMS column if KPI has passed hr_pms_review or later
    if (statusIndex >= STATUS_ORDER.indexOf('hr_pms_review')) {
      cols.push({ 
        key: 'hr_pms_achieved_value' as any, 
        label: 'HR PMS Approved', 
        shortLabel: 'HR PMS',
        colorClass: 'text-pink-600 dark:text-pink-400', 
        bgClass: 'bg-pink-50 dark:bg-pink-950/30' 
      });
    }
    
    // Show Auditor column if KPI has passed audit or later
    if (statusIndex >= STATUS_ORDER.indexOf('audit')) {
      cols.push({ 
        key: 'auditor_achieved_value', 
        label: 'Auditor Approved', 
        shortLabel: 'Auditor',
        colorClass: 'text-purple-600 dark:text-purple-400', 
        bgClass: 'bg-purple-50 dark:bg-purple-950/30' 
      });
    }
    
    // Show Management column if KPI has passed management_review or approved
    if (statusIndex >= STATUS_ORDER.indexOf('management_review')) {
      cols.push({ 
        key: 'management_achieved_value', 
        label: 'Management Approved', 
        shortLabel: 'Mgmt',
        colorClass: 'text-emerald-600 dark:text-emerald-400', 
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/30' 
      });
    }
    
    return cols;
  }, [kpiStatus]);

  // Format achieved value for display
  const formatAchievedValue = (value: number | null): string => {
    if (value === null) return '—';
    
    if (uomType === 'binary') {
      // Use stored qualitativeOptions if available, fallback to BINARY_OPTIONS only if null
      const options = qualitativeOptions?.length 
        ? qualitativeOptions 
        : BINARY_OPTIONS;
      const option = options.find(o => o.rating === value);
      return option?.label || value.toString();
    }
    
    if (uomType === 'tiered' && qualitativeOptions?.length) {
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
      <div className={`grid grid-cols-2 sm:grid-cols-4 ${compact ? 'gap-2' : 'gap-3'}`}>
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

      {/* Submissions Table with Dynamic Reviewer Columns */}
      <ScrollArea className={`${compact ? 'h-[200px]' : 'h-[250px]'} rounded-md border mt-3`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px] sm:w-[80px] sticky left-0 bg-background">Date</TableHead>
                {visibleColumns.map(col => (
                  <TableHead 
                    key={col.key} 
                    className={cn('text-center min-w-[60px] sm:min-w-[80px]', col.colorClass)}
                  >
                    {col.shortLabel}
                  </TableHead>
                ))}
                <TableHead className="text-center w-[60px] hidden sm:table-cell">Files</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Submitted At</TableHead>
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
              const selfValue = submission.achieved_value;
              const isNo = isNoValue(selfValue);
              
              // Check for live manager override preview (during editing)
              const hasLiveOverride = managerOverrides?.has(submission.sub_period_value);
              const liveOverrideValue = hasLiveOverride ? managerOverrides?.get(submission.sub_period_value) : null;
              
              return (
                <TableRow 
                  key={submission.id}
                  className={cn(
                    hasLiveOverride && liveOverrideValue !== selfValue 
                      ? 'bg-amber-50/50 dark:bg-amber-950/20' 
                      : isNo 
                        ? 'bg-red-50/50 dark:bg-red-950/20' 
                        : ''
                  )}
                >
                  <TableCell className="font-medium sticky left-0 bg-inherit">{formattedDate}</TableCell>
                  
                  {visibleColumns.map((col, colIndex) => {
                    const value = submission[col.key] as number | null;
                    
                    // For Self column, handle live override preview
                    if (col.key === 'achieved_value' && hasLiveOverride && liveOverrideValue !== selfValue) {
                      return (
                        <TableCell key={col.key} className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-muted-foreground line-through text-sm">
                              {formatAchievedValue(selfValue)}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className={liveOverrideValue === 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                              {formatAchievedValue(liveOverrideValue ?? null)}
                            </span>
                            <Badge variant="outline" className="text-xs h-5 px-1 gap-0.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                              <Edit2 className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                            </Badge>
                          </div>
                        </TableCell>
                      );
                    }
                    
                    // For reviewer columns, check if value differs from previous level
                    const prevColKey = colIndex > 0 ? visibleColumns[colIndex - 1].key : null;
                    const prevValue = prevColKey ? (submission[prevColKey] as number | null) : null;
                    const isChanged = prevValue !== null && value !== null && prevValue !== value;
                    const isNoVal = isNoValue(value);
                    
                    return (
                      <TableCell key={col.key} className={cn('text-center', col.colorClass)}>
                        {value !== null ? (
                          <div className="flex items-center justify-center gap-1">
                            {isChanged && (
                              <>
                                <span className="text-muted-foreground line-through text-xs">
                                  {formatAchievedValue(prevValue)}
                                </span>
                                <span className="text-muted-foreground text-xs">→</span>
                              </>
                            )}
                            <span className={cn(
                              isNoVal && 'text-red-600 dark:text-red-400',
                              isChanged && 'font-semibold'
                            )}>
                              {formatAchievedValue(value)}
                            </span>
                            {isChanged && (
                              <Badge variant="outline" className={cn('text-[10px] h-4 px-1', col.bgClass)}>
                                Changed
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                  
                  <TableCell className="text-center hidden sm:table-cell">
                    {(() => {
                      const urls = (submission.evidence_urls as string[] | null) || [];
                      if (urls.length === 0) return <span className="text-muted-foreground">—</span>;
                      return (
                        <button
                          type="button"
                          onClick={() => urls.forEach((url, i) => openStorageFile(url, buildEvidenceFileName(url, kpiName, `Day_${submission.sub_period_value}`, i, urls.length)))}
                          className="inline-flex items-center gap-0.5 text-primary hover:underline mx-auto"
                          title={`${urls.length} file(s) attached`}
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{urls.length}</span>
                        </button>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                    {formattedTimestamp}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
        </div>
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
          {visibleColumns.length > 1 && (
            <Badge variant="outline" className="text-[10px] h-5">
              {visibleColumns.length} levels
            </Badge>
          )}
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
          {visibleColumns.length > 1 && (
            <Badge variant="outline" className="text-[10px] h-5">
              {visibleColumns.length} review levels
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
}

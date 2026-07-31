import { useState, useEffect } from 'react';
import { LucideIcon, FileText, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { openStorageFileGroup, buildEvidenceFileName } from '@/lib/storageDownload';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RatingLevel } from '@/hooks/useKpis';
import { getRatingLevelColor, ratingLevelToLabel } from '@/lib/reviewConstants';

export type StageStatus = 'completed' | 'current' | 'pending';

interface ReviewStageCardProps {
  icon: LucideIcon;
  iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose';
  title: string;
  score: number | null;
  rating: RatingLevel | null;
  remarks: string | null;
  evidenceUrls: string[];
  status: StageStatus;
  isNA?: boolean;
  achievedValue?: number | null;
  /**
   * When provided and `achievedValue` is null, render "—" with a tooltip
   * explaining the value could not be reconstructed (Self stage RCA Jun-2026).
   */
  achievedValueUnknownReason?: string | null;
  kpiName?: string | null;
  employeeCode?: string | null;
  /**
   * RCA Jun-2026 (Auditor saw N/A while data existed): when the parent's
   * submissions query is still in flight, render a skeleton instead of
   * the misleading "N/A" pill so loading is not confused with "no data".
   */
  isLoading?: boolean;
  /**
   * §88.5 — when true, render an italic hint under the Self card that the
   * value will be refreshed from the Org KPI on the next propagation.
   * Only used for the Self stage when the row was system auto-advanced
   * and no employee evidence exists yet.
   */
  autoAdvancedResyncHint?: boolean;
}

const iconColorClasses = {
  blue: 'bg-blue-500/10 text-blue-500',
  amber: 'bg-amber-500/10 text-amber-500',
  purple: 'bg-purple-500/10 text-purple-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  teal: 'bg-teal-500/10 text-teal-500',
  rose: 'bg-rose-500/10 text-rose-500',
};

const borderColorClasses = {
  blue: 'border-blue-200 dark:border-blue-800',
  amber: 'border-amber-200 dark:border-amber-800',
  purple: 'border-purple-200 dark:border-purple-800',
  emerald: 'border-emerald-200 dark:border-emerald-800',
  teal: 'border-teal-200 dark:border-teal-800',
  rose: 'border-rose-200 dark:border-rose-800',
};

function getRatingLabel(rating: RatingLevel | null | undefined): string {
  if (!rating) return 'N/A';
  return ratingLevelToLabel(rating);
}

function getRatingColor(rating: RatingLevel | null | undefined): string {
  if (!rating) return '#6B7280';
  return getRatingLevelColor(rating);
}

export function ReviewStageCard({
  icon: Icon,
  iconColor,
  title,
  score,
  rating,
  remarks,
  evidenceUrls,
  status,
  isNA = false,
  achievedValue,
  achievedValueUnknownReason,
  kpiName,
  employeeCode,
  isLoading = false,
  autoAdvancedResyncHint = false,
}: ReviewStageCardProps) {
  const isPending = status === 'pending';
  const isCurrent = status === 'current';
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [remarksExpanded, setRemarksExpanded] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    setIsTouchDevice(mql.matches);
    const onChange = () => setIsTouchDevice(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <div
      className={cn(
        'p-2 sm:p-3 rounded-lg border transition-all',
        borderColorClasses[iconColor],
        isPending && 'opacity-50 bg-muted/30',
        isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        !isPending && !isCurrent && 'bg-card'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2">
        <div className={cn('h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center', iconColorClasses[iconColor])}>
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </div>
        <span className="text-xs font-medium">{title}</span>
        {isCurrent && (
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
            Current
          </Badge>
        )}
      </div>

      {/* Score */}
      <div className="mb-2">
        {/* Achieved Value */}
        {!isPending && achievedValue !== null && achievedValue !== undefined && (
          <div className="text-xs text-muted-foreground mb-1">
            Value: <span className="font-medium text-foreground">{achievedValue}</span>
          </div>
        )}
        {!isPending && (achievedValue === null || achievedValue === undefined) && achievedValueUnknownReason && (
          <div className="text-xs text-muted-foreground mb-1 inline-flex items-center gap-1">
            Value: <span className="font-medium text-foreground">—</span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{achievedValueUnknownReason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {isLoading && !isPending ? (
          <Skeleton data-testid="stage-score-skeleton" className="h-5 w-16" />
        ) : isNA ? (
          <Badge variant="outline" className="text-xs">N/A</Badge>
        ) : score !== null ? (
          <Badge 
            style={{ backgroundColor: getRatingColor(rating) }} 
            className="text-white text-xs"
          >
            Rating: {score}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {isPending ? 'Pending' : 'N/A'}
          </Badge>
        )}
      </div>

      {/* Remarks - truncated with tooltip */}
      {remarks ? (
        isTouchDevice ? (
          <p
            onClick={() => setRemarksExpanded(prev => !prev)}
            className={cn(
              'text-xs text-muted-foreground cursor-pointer min-h-[2rem]',
              !remarksExpanded && 'line-clamp-2'
            )}
          >
            {remarks}
          </p>
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground line-clamp-2 cursor-help min-h-[2rem]">
                  {remarks}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-sm whitespace-pre-wrap">{remarks}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      ) : (
        <p className="text-xs text-muted-foreground/50 italic min-h-[2rem]">
          No remarks
        </p>
      )}

      {/* Evidence Links */}
      {evidenceUrls.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
          {evidenceUrls.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => openStorageFileGroup(evidenceUrls, (u, i) => buildEvidenceFileName(u, employeeCode, kpiName, title, i, evidenceUrls.length), idx)}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              <FileText className="h-3 w-3" />
              Evidence{evidenceUrls.length > 1 ? ` ${idx + 1}` : ''}
              <ExternalLink className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {autoAdvancedResyncHint && (
        <p className="text-[10px] italic text-muted-foreground/80 mt-1">
          Will re-sync from Org KPI on next propagation
        </p>
      )}
    </div>
  );
}

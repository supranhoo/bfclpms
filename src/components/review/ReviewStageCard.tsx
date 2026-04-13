import { useState, useEffect } from 'react';
import { LucideIcon, FileText, ExternalLink } from 'lucide-react';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  kpiName?: string | null;
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
  kpiName,
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
        {isNA ? (
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
              onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, title, idx, evidenceUrls.length))}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              <FileText className="h-3 w-3" />
              Evidence{evidenceUrls.length > 1 ? ` ${idx + 1}` : ''}
              <ExternalLink className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

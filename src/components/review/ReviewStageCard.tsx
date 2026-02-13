import { LucideIcon, FileText, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { RatingLevel } from '@/hooks/useKpis';
import { ratingOptions } from '@/lib/reviewConstants';

export type StageStatus = 'completed' | 'current' | 'pending';

interface ReviewStageCardProps {
  icon: LucideIcon;
  iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose';
  title: string;
  score: number | null;
  rating: RatingLevel | null;
  remarks: string | null;
  evidenceUrl: string | null;
  status: StageStatus;
  isNA?: boolean;
  achievedValue?: number | null;
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
  return ratingOptions.find(r => r.value === rating)?.label || 'N/A';
}

function getRatingColor(rating: RatingLevel | null | undefined): string {
  return ratingOptions.find(r => r.value === rating)?.color || '#6B7280';
}

export function ReviewStageCard({
  icon: Icon,
  iconColor,
  title,
  score,
  rating,
  remarks,
  evidenceUrl,
  status,
  isNA = false,
  achievedValue,
}: ReviewStageCardProps) {
  const isPending = status === 'pending';
  const isCurrent = status === 'current';

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
            {isPending ? 'Pending' : 'Not Set'}
          </Badge>
        )}
      </div>

      {/* Remarks - truncated with tooltip */}
      {remarks ? (
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
      ) : (
        <p className="text-xs text-muted-foreground/50 italic min-h-[2rem]">
          No remarks
        </p>
      )}

      {/* Evidence Link */}
      {evidenceUrl && (
        <a
          href={evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
        >
          <FileText className="h-3 w-3" />
          Evidence
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

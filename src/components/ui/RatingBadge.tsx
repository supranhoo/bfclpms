import { Badge } from '@/components/ui/badge';
import { RATING_SCALE, getScoreBadgeClass, getScoreLabel, getScoreShortLabel } from '@/lib/reviewConstants';
import { cn } from '@/lib/utils';

interface RatingBadgeProps {
  score: number | null | undefined;
  short?: boolean;
  className?: string;
}

/**
 * Reusable badge that renders the canonical color/label for a 0-5 numeric score.
 * Uses the severity gradient: score 2 = light pink, score 1 = bright red, score 0 = deep maroon.
 */
export function RatingBadge({ score, short = false, className }: RatingBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Not Set
      </Badge>
    );
  }

  const rounded = Math.round(Math.min(5, Math.max(0, score)));
  const label = short ? getScoreShortLabel(rounded) : getScoreLabel(rounded);

  return (
    <Badge className={cn(getScoreBadgeClass(rounded), className)}>
      {rounded} - {label}
    </Badge>
  );
}

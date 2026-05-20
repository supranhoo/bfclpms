import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * SafetySkeletonBlock — sanctioned skeleton placeholder for Safety
 * surfaces. Use instead of ad-hoc spinners so list/detail loading states
 * stay visually consistent across the module. (Phase 2 UX polish.)
 *
 * Variants:
 *  - "list"   — vertical stack of row placeholders (list pages).
 *  - "detail" — header + 2 content cards (detail pages).
 */
export interface SafetySkeletonBlockProps {
  variant: 'list' | 'detail';
  /** Number of row placeholders for `list`. Defaults to 6. */
  rows?: number;
  className?: string;
}

export function SafetySkeletonBlock({
  variant,
  rows = 6,
  className,
}: SafetySkeletonBlockProps) {
  if (variant === 'list') {
    return (
      <div
        className={cn('p-3 space-y-2', className)}
        data-testid="safety-skeleton-list"
        aria-busy="true"
        aria-live="polite"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border bg-card p-3"
          >
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  // detail
  return (
    <div
      className={cn('space-y-4', className)}
      data-testid="safety-skeleton-detail"
      aria-busy="true"
      aria-live="polite"
    >
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-1/4" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}
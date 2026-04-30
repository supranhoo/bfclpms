import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SafetyMobileListCard
 * --------------------
 * Stacked card row used by every Safety list page on mobile (< 768px).
 * Mirrors the Worker-card UX pattern in MobileSelfReviewCard so PMS and
 * Safety feel like one product. Strictly presentational — parent owns
 * data and navigation.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │ TITLE (bold, truncate)              ›   │
 *   │ subtitle (muted, truncate)              │
 *   │ meta · meta · meta                      │
 *   │ [badge] [badge] [badge]                 │
 *   └─────────────────────────────────────────┘
 *
 * Touch target: full card is the hit area (min-h 88px → > 44px ✓).
 */
export interface SafetyMobileListCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Optional leading icon / colour swatch */
  leading?: ReactNode;
  /** Show chevron on the right (default true when onClick) */
  showChevron?: boolean;
}

export function SafetyMobileListCard({
  title,
  subtitle,
  meta,
  badges,
  onClick,
  className,
  leading,
  showChevron,
}: SafetyMobileListCardProps) {
  const interactive = typeof onClick === 'function';
  const chevron = showChevron ?? interactive;

  const content = (
    <div
      className={cn(
        'flex items-start gap-3 p-3 sm:p-4 bg-card rounded-lg border',
        'min-h-[88px]',
        interactive && 'hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer',
        className,
      )}
    >
      {leading && <div className="shrink-0 pt-0.5">{leading}</div>}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="font-medium text-sm text-foreground leading-snug line-clamp-2">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground line-clamp-2">{subtitle}</div>
        )}
        {meta && (
          <div className="text-[11px] text-muted-foreground line-clamp-1">{meta}</div>
        )}
        {badges && <div className="flex flex-wrap items-center gap-1.5 pt-1">{badges}</div>}
      </div>
      {chevron && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
      )}
    </div>
  );

  if (!interactive) return content;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      {content}
    </button>
  );
}
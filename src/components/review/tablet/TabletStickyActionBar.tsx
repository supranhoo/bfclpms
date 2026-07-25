import { type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';
import { cn } from '@/lib/utils';

/**
 * TabletStickyActionBar — bottom-anchored action rail visible on tablet and
 * (optionally) mobile. Ports the SafetyStickyActionBar pattern into the
 * review module so bulk actions (Save/Send-back/Approve) stay reachable
 * without scrolling on iPad-class screens.
 * ADR-170 §4.1.
 *
 * Desktop (>=1280) hides the bar unless `forceVisible` is set.
 */
export interface TabletStickyActionBarProps {
  children: ReactNode;
  /** Also render on mobile (< 768). Defaults to true. */
  includeMobile?: boolean;
  /** Force visibility at all breakpoints. */
  forceVisible?: boolean;
  className?: string;
}

export function TabletStickyActionBar({
  children,
  includeMobile = true,
  forceVisible = false,
  className,
}: TabletStickyActionBarProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const visible = forceVisible || isTablet || (includeMobile && isMobile);
  if (!visible) return null;
  return (
    <div
      data-testid="tablet-sticky-action-bar"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur',
        'px-3 py-2 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.15)]',
        'flex items-center gap-2 justify-end',
        'pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
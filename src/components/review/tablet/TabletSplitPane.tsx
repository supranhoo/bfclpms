import { type ReactNode } from 'react';
import { useIsTablet } from '@/hooks/use-tablet';
import { cn } from '@/lib/utils';

/**
 * TabletSplitPane — landscape-only two-pane layout for the tablet tier.
 * Left rail lists employees / entities; right pane loads the detail view.
 * Falls back to `right` alone (single column) in portrait or outside the
 * tablet band, so callers can safely wrap any surface. ADR-170 §4.1.
 */
export interface TabletSplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  leftWidthPx?: number;
  forceSingle?: boolean;
  className?: string;
}

export function TabletSplitPane({
  left,
  right,
  leftWidthPx = 320,
  forceSingle = false,
  className,
}: TabletSplitPaneProps) {
  const isTablet = useIsTablet();
  const isLandscape =
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
  const useSplit = isTablet && isLandscape && !forceSingle;

  if (!useSplit) {
    return <div className={className}>{right}</div>;
  }
  return (
    <div className={cn('flex gap-3 h-full min-h-0', className)}>
      <aside
        className="shrink-0 border-r pr-3 overflow-y-auto"
        style={{ width: leftWidthPx }}
      >
        {left}
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">{right}</main>
    </div>
  );
}
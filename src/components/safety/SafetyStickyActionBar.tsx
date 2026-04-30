import { type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * SafetyStickyActionBar
 * ---------------------
 * Mobile-only sticky bottom bar for the primary action(s) on a Safety
 * surface (Report Incident, Submit, Request Permit, etc). Renders nothing
 * on `md+` so desktop keeps the in-flow button.
 *
 * Pages MUST add `pb-24` (or rely on SafetyLayout's `pb-24 md:pb-0`) so
 * the bar does not cover content. Honours iOS safe-area inset.
 */
export interface SafetyStickyActionBarProps {
  children: ReactNode;
  /** When true, ALWAYS render (use sparingly — e.g. wizard footers). */
  forceVisible?: boolean;
  className?: string;
  /** Optional content rendered ABOVE the actions row (e.g. offline notice). */
  banner?: ReactNode;
}

export function SafetyStickyActionBar({
  children,
  forceVisible,
  className,
  banner,
}: SafetyStickyActionBarProps) {
  const isMobile = useIsMobile();
  if (!forceVisible && !isMobile) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur',
        'px-3 py-2 sm:px-4 sm:py-3',
        'shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
        className,
      )}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      data-testid="safety-sticky-action-bar"
    >
      {banner && <div className="mb-2">{banner}</div>}
      <div className="flex items-center gap-2 [&>button]:flex-1 [&>a]:flex-1">
        {children}
      </div>
    </div>
  );
}
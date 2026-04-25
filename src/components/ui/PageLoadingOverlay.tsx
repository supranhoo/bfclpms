/**
 * PageLoadingOverlay
 * ------------------
 * Centered, branded full-screen indicator shown during page navigation
 * (Suspense lazy-load) and the initial data fetch burst on a route change.
 *
 * Uses the shared `RocketGrowthArt` SVG and `rg-*` keyframes from
 * `src/index.css`. Honors `prefers-reduced-motion`. Pure presentation.
 *
 * Policy: POLICY.md §103 — centered overlay reserved for page navigation
 * and initial data loads. Refresh actions use inline button feedback only.
 */
import { memo } from 'react';
import { RocketGrowthArt } from './RocketGrowthArt';

interface PageLoadingOverlayProps {
  open: boolean;
  label?: string;
  sublabel?: string;
}

function PageLoadingOverlayImpl({
  open,
  label = 'Please wait',
  sublabel = 'Loading…',
}: PageLoadingOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/95 px-8 py-7 shadow-2xl">
        <RocketGrowthArt />
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

export const PageLoadingOverlay = memo(PageLoadingOverlayImpl);

/**
 * RefreshOverlay
 * --------------
 * @deprecated Use `PageLoadingOverlay` instead. Per POLICY.md §103, centered
 * overlays are reserved for page navigation and initial data loads. Refresh
 * actions should rely on inline button feedback only. Kept exported for
 * backwards compatibility; new call sites must NOT mount this.
 */
import { memo } from 'react';
import { RocketGrowthArt } from './RocketGrowthArt';

interface RefreshOverlayProps {
  open: boolean;
  label?: string;
  sublabel?: string;
}

function RefreshOverlayImpl({
  open,
  label = 'Refreshing data…',
  sublabel = 'Fetching the latest scores and assignments',
}: RefreshOverlayProps) {
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

export const RefreshOverlay = memo(RefreshOverlayImpl);

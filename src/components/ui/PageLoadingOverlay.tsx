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
 *
 * Branding: company name / tagline / logo come from the `system_settings`
 * keys managed by `useBrandingSettings`. Empty values render the original
 * "Please wait / Loading…" card unchanged. Set `variant="inline"` to embed
 * the card inside another container (used by the admin live-preview panel).
 * Pass explicit `branding` to bypass the hook (used in previews and tests).
 */
import { memo } from 'react';
import { RocketGrowthArt } from './RocketGrowthArt';
import { useBrandingSettings, type BrandingSettings } from '@/hooks/useBrandingSettings';

interface PageLoadingOverlayProps {
  open: boolean;
  label?: string;
  sublabel?: string;
  /** `fixed` (default) renders a full-screen overlay; `inline` renders the card only. */
  variant?: 'fixed' | 'inline';
  /** Override the hook-loaded branding (used in previews / tests). */
  branding?: Partial<BrandingSettings>;
}

function PageLoadingOverlayImpl({
  open,
  label = 'Please wait',
  sublabel = 'Loading…',
  variant = 'fixed',
  branding,
}: PageLoadingOverlayProps) {
  const hookBranding = useBrandingSettings();
  const b: BrandingSettings = { ...hookBranding, ...(branding ?? {}) };

  if (!open) return null;

  const showLogo = b.showLogo && b.logoUrl;
  const showName = b.companyName.length > 0;
  const showTagline = b.tagline.length > 0;

  const card = (
    <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/95 px-8 py-7 shadow-2xl">
      <RocketGrowthArt />
      {(showLogo || showName || showTagline) && (
        <div className="flex flex-col items-center gap-1 -mt-2">
          {showLogo && (
            <img
              src={b.logoUrl}
              alt={b.companyName || 'Company logo'}
              className="max-h-10 w-auto object-contain"
            />
          )}
          {showName && (
            <p className="text-lg font-bold text-primary tracking-wide text-center">
              {b.companyName}
            </p>
          )}
          {showTagline && (
            <p className="text-xs text-muted-foreground text-center">{b.tagline}</p>
          )}
        </div>
      )}
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );

  if (variant === 'inline') {
    return (
      <div role="status" aria-live="polite" aria-label={label} className="flex justify-center">
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {card}
    </div>
  );
}

export const PageLoadingOverlay = memo(PageLoadingOverlayImpl);

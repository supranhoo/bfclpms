/**
 * RefreshOverlay
 * --------------
 * A centered, branded full-screen indicator shown while a primary data view
 * is refetching. Replaces tiny inline spinners that users miss.
 *
 * Visual: a rocket launching along a rising green growth chart — communicates
 * "your data is being refreshed and improved", not just "something is loading".
 *
 * Usage:
 *   <RefreshOverlay open={isRefreshing} />
 *
 * Notes:
 *  - Pure presentation; no business logic.
 *  - Honors `prefers-reduced-motion` (animations disabled, static art remains).
 *  - Uses semantic design tokens (no raw hex outside the SVG palette).
 */
import { memo } from 'react';

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

/**
 * Inline SVG: navy axes, three rising green arrows (sequential fade-in),
 * and a rocket at the tip of the tallest arrow with a flickering flame.
 * Palette intentionally fixed to brand colors used in the reference asset.
 */
function RocketGrowthArt() {
  // Brand palette (matches the reference image)
  const navy = '#0E2A47';
  const green = '#22C55E';
  const greenSoft = '#86EFAC';
  const flame = '#FB923C';

  return (
    <svg
      width="180"
      height="120"
      viewBox="0 0 180 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Soft glow behind chart */}
      <ellipse cx="120" cy="40" rx="55" ry="30" fill={greenSoft} opacity="0.18" />

      {/* Axes */}
      <line x1="20" y1="100" x2="170" y2="100" stroke={navy} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="100" x2="20" y2="15" stroke={navy} strokeWidth="2.5" strokeLinecap="round" />
      {/* Y-axis arrowhead */}
      <polygon points="20,8 16,18 24,18" fill={navy} />
      {/* X-axis arrowhead */}
      <polygon points="178,100 168,96 168,104" fill={navy} />

      {/* Rising arrow #1 (shortest) */}
      <g className="rg-arrow rg-arrow-1">
        <line x1="35" y1="92" x2="60" y2="78" stroke={green} strokeWidth="4" strokeLinecap="round" />
        <polygon points="64,76 56,72 58,82" fill={green} />
      </g>

      {/* Rising arrow #2 (medium) */}
      <g className="rg-arrow rg-arrow-2">
        <line x1="60" y1="78" x2="95" y2="58" stroke={green} strokeWidth="4" strokeLinecap="round" />
        <polygon points="99,56 91,52 93,62" fill={green} />
      </g>

      {/* Rising arrow #3 (tallest, leads into rocket) */}
      <g className="rg-arrow rg-arrow-3">
        <line x1="95" y1="58" x2="135" y2="32" stroke={green} strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* Rocket */}
      <g className="rg-rocket">
        {/* Flame */}
        <g className="rg-flame">
          <path
            d="M132 48 Q135 56 138 48 Q140 54 142 47 Q140 45 137 44 Q134 45 132 48 Z"
            fill={flame}
          />
        </g>
        {/* Body */}
        <path
          d="M150 18 Q156 26 156 36 L156 42 L142 42 L142 36 Q142 26 150 18 Z"
          fill={navy}
        />
        {/* Window */}
        <circle cx="149" cy="30" r="3" fill={greenSoft} />
        {/* Fins */}
        <path d="M142 36 L137 44 L142 42 Z" fill={green} />
        <path d="M156 36 L161 44 L156 42 Z" fill={green} />
      </g>
    </svg>
  );
}

export const RefreshOverlay = memo(RefreshOverlayImpl);

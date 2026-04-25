/**
 * RocketLaunchArt (exported as RocketGrowthArt for backwards compatibility)
 * -----------------------------------------------------------------------
 * Shared brand SVG used by PageLoadingOverlay (page navigation / initial
 * data loads) and the deprecated RefreshOverlay. Renders a single rocket
 * ascending with a flickering flame and a faint motion trail — the prior
 * X/Y axes and growth-chart arrows have been removed for clarity.
 *
 * Animations live in `src/index.css` under the `rg-*` namespace and honor
 * `prefers-reduced-motion`.
 *
 * Brand palette is intentionally fixed (matches the reference asset). This is
 * the documented exception to the "semantic tokens only" rule, scoped to
 * isolated brand SVG art (see Core memory).
 */
export function RocketLaunchArt() {
  const navy = '#0E2A47';
  const green = '#22C55E';
  const greenSoft = '#86EFAC';
  const flame = '#FB923C';

  return (
    <svg
      width="120"
      height="140"
      viewBox="0 0 120 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Faint motion trail dots beneath the rocket — staggered fades */}
      <g className="rg-trail">
        <circle className="rg-trail-dot rg-trail-1" cx="60" cy="100" r="2.5" fill={green} />
        <circle className="rg-trail-dot rg-trail-2" cx="60" cy="115" r="2" fill={green} />
        <circle className="rg-trail-dot rg-trail-3" cx="60" cy="128" r="1.6" fill={green} />
      </g>
      {/* Rocket ascends vertically */}
      <g className="rg-rocket">
        <g className="rg-flame" transform="translate(60 86)">
          <path
            d="M-6 0 Q-3 10 0 2 Q2 9 5 1 Q3 -2 0 -3 Q-3 -2 -6 0 Z"
            fill={flame}
          />
        </g>
        {/* Rocket body — pointed nose, rounded tube */}
        <path
          d="M60 18 Q70 32 70 56 L70 80 L50 80 L50 56 Q50 32 60 18 Z"
          fill={navy}
        />
        {/* Window */}
        <circle cx="60" cy="46" r="5" fill={greenSoft} />
        <circle cx="60" cy="46" r="2.5" fill={navy} opacity="0.35" />
        {/* Fins */}
        <path d="M50 66 L40 84 L50 80 Z" fill={green} />
        <path d="M70 66 L80 84 L70 80 Z" fill={green} />
        {/* Body seam highlight */}
        <line x1="60" y1="60" x2="60" y2="78" stroke={greenSoft} strokeWidth="1" opacity="0.4" />
      </g>
    </svg>
  );
}

// Backwards-compatible alias — existing imports use `RocketGrowthArt`.
export const RocketGrowthArt = RocketLaunchArt;

/**
 * RocketGrowthArt
 * ---------------
 * Shared brand SVG used by both PageLoadingOverlay (page navigation / initial
 * data loads) and RefreshOverlay (deprecated). Animations live in
 * `src/index.css` under the `rg-*` keyframe namespace and honor
 * `prefers-reduced-motion`.
 *
 * Brand palette is intentionally fixed (matches the reference asset). This is
 * the documented exception to the "semantic tokens only" rule, scoped to
 * isolated brand SVG art (see Core memory).
 */
export function RocketGrowthArt() {
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
      <ellipse cx="120" cy="40" rx="55" ry="30" fill={greenSoft} opacity="0.18" />
      <line x1="20" y1="100" x2="170" y2="100" stroke={navy} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="100" x2="20" y2="15" stroke={navy} strokeWidth="2.5" strokeLinecap="round" />
      <polygon points="20,8 16,18 24,18" fill={navy} />
      <polygon points="178,100 168,96 168,104" fill={navy} />
      <g className="rg-arrow rg-arrow-1">
        <line x1="35" y1="92" x2="60" y2="78" stroke={green} strokeWidth="4" strokeLinecap="round" />
        <polygon points="64,76 56,72 58,82" fill={green} />
      </g>
      <g className="rg-arrow rg-arrow-2">
        <line x1="60" y1="78" x2="95" y2="58" stroke={green} strokeWidth="4" strokeLinecap="round" />
        <polygon points="99,56 91,52 93,62" fill={green} />
      </g>
      <g className="rg-arrow rg-arrow-3">
        <line x1="95" y1="58" x2="135" y2="32" stroke={green} strokeWidth="4" strokeLinecap="round" />
      </g>
      <g className="rg-rocket">
        <g className="rg-flame">
          <path
            d="M132 48 Q135 56 138 48 Q140 54 142 47 Q140 45 137 44 Q134 45 132 48 Z"
            fill={flame}
          />
        </g>
        <path
          d="M150 18 Q156 26 156 36 L156 42 L142 42 L142 36 Q142 26 150 18 Z"
          fill={navy}
        />
        <circle cx="149" cy="30" r="3" fill={greenSoft} />
        <path d="M142 36 L137 44 L142 42 Z" fill={green} />
        <path d="M156 36 L161 44 L156 42 Z" fill={green} />
      </g>
    </svg>
  );
}

import * as React from "react";

/**
 * useIsTablet — true when viewport is in the tablet band [768, 1280).
 * Complements `useIsMobile` (< 768). Desktop (>= 1280) returns false.
 *
 * POLICY §UX-TABLET-BREAKPOINT-CONTRACT (ADR-170):
 *   < 768 px    → phone (existing mobile primitives)
 *   768–1279 px → tablet (this hook + src/components/review/tablet/*)
 *   ≥ 1280 px   → desktop (existing table layout — untouched)
 */
const TABLET_MIN = 768;
const TABLET_MAX = 1280; // exclusive upper bound (desktop starts at 1280)

export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(min-width: ${TABLET_MIN}px) and (max-width: ${TABLET_MAX - 1}px)`,
    );
    const update = () => {
      const w = window.innerWidth;
      setIsTablet(w >= TABLET_MIN && w < TABLET_MAX);
    };
    mql.addEventListener("change", update);
    update();
    return () => mql.removeEventListener("change", update);
  }, []);

  return !!isTablet;
}

export const TABLET_BREAKPOINT_MIN = TABLET_MIN;
export const TABLET_BREAKPOINT_MAX = TABLET_MAX;
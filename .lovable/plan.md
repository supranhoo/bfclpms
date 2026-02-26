

# Fix: Tap-to-Expand Remarks on All Touch Devices (v1.46.14)

## Problem

The `useIsMobile` hook has a 768px breakpoint, so tablets (768px+) are classified as "desktop" and get hover tooltips instead of tap-to-expand. Tablets are touch devices with no hover capability, making remarks unreadable.

## Solution

Replace the `useIsMobile` check with a **touch-capability detection** using the CSS media query `(pointer: coarse)`, which correctly identifies all touch-first devices (phones AND tablets) regardless of screen width.

## File to Change

**`src/components/review/ReviewStageCard.tsx`**

Replace `useIsMobile()` with a `useTouchDevice()` check using `window.matchMedia('(pointer: coarse)')`. This way:
- Phones and tablets --> tap-to-expand
- Desktop with mouse --> tooltip on hover

### Implementation

Add a local `isTouchDevice` state using `matchMedia('(pointer: coarse)')` instead of the width-based `useIsMobile` hook. The rest of the component logic stays identical -- just swap the boolean used in the conditional.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | UI-only change |
| Regression | None | Desktop hover behavior unchanged; phones keep tap behavior |
| Device coverage | Positive | Now covers tablets, foldables, and all touch-first devices |


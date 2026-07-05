## Issue
Clicking **Finalize / View** opens `HrFinalizationSheet` as a right-side drawer. HR needs the full viewport for scoring, timeline, and eligibility panels.

## Fix (UI-only, `src/components/annual-review/HrFinalizationSheet.tsx`)

Convert the Sheet into a full-viewport overlay while keeping every prop, hook, and child component unchanged.

1. Change `SheetContent` from the default right-side drawer to fill the viewport:
   - `side="right"` kept for slide animation
   - Add `className="w-screen max-w-none sm:max-w-none p-0 flex flex-col"` so it covers the whole screen on all breakpoints.
2. Wrap the header/body/footer in an inner container with `max-w-6xl mx-auto w-full px-6 py-4` so long-form content stays readable on wide monitors while the overlay itself is full-page.
3. Make the body scroll independently: header sticky top, footer sticky bottom, body `flex-1 overflow-y-auto`.
4. Keep `open` / `onOpenChange` contract identical — no changes required in `AnnualReviewAdmin.tsx`.

## Not changing
- Finalize RPC, scoring logic, reassignment dialog, or any data query.
- Component name/exports (still `HrFinalizationSheet`) — rename can happen later if desired.
- Callers in `AnnualReviewAdmin.tsx`.

## Risk
Minimal. Purely a layout/size override on the existing Radix Sheet. Escape/overlay-click close still works. Mobile becomes full-screen (improvement).

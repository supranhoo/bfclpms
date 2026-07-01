## Goal
Add a "Fullscreen" button in `src/components/review/EvidencePreviewDialog.tsx` (left of "Open in new tab") that expands the preview dialog to occupy the full viewport, so users can inspect wide Excel/PDF evidence comfortably on large screens.

## UI Change
- New button (icon `Maximize2` / `Minimize2` from lucide-react, `variant="outline" size="sm"`, label "Fullscreen" / "Exit fullscreen") placed to the left of "Open in new tab" in the action row.
- Clicking toggles a local `isFullscreen` state.
- When `isFullscreen`:
  - `DialogContent` classes switch from `max-w-5xl h-[85vh]` to `max-w-[100vw] w-screen h-screen sm:rounded-none p-4`.
  - iframe/img min-height uses `min-h-[85vh]` instead of `65vh`.
- Reset `isFullscreen` to `false` whenever the dialog closes.
- Mobile (Drawer) path unchanged — drawers already fill the screen.

## Scope
Single file: `src/components/review/EvidencePreviewDialog.tsx`. Pure presentation change; no logic, hooks, storage, or policy impact.

## Risk
None material — additive UI state, no data flow changes. Rollback = revert the file.

## Not Applicable
Docs/POLICY updates, DB, tests (pure UI toggle, existing tests still pass).

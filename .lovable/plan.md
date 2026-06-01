Rollback ModuleHub.tsx to the previous landing page layout, reverting the grouped-family premium redesign.

## What changed in the redesign
The redesign commit (`0d1b282d`) modified only one file: `src/pages/ModuleHub.tsx`. It replaced the original simple centered layout with:
- Family-based module grouping (Core HRMS, Performance & Growth, etc.)
- Layered background gradients and radial effects
- Left-aligned welcome section with "HRMS Workspace" eyebrow chip
- Section dividers with item counts

## What will be restored
The original simple layout:
- Centered welcome: "Welcome back, {firstName}!"
- Subtitle: "Select a module to get started"
- Flat grid of module cards (no grouping)
- Clean `bg-muted/30` background
- Coming Soon placeholders inline with active modules

## Scope
Only `src/pages/ModuleHub.tsx` is touched.
`MinimalHeader.tsx` and `ModuleCard.tsx` were unchanged by the redesign and remain as-is.

## Risk
None — this is a pure revert of a single presentational file to a known-good previous commit.
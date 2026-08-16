# Performance Console — visual polish pass (presentation only)

The screen currently reads as a wireframe: a bare filter row floating on the page background, a header with no surface, category tabs that clip mid-word at the right edge, and a lone KRA row whose metric columns sit unaligned and unanchored. Nothing about the data, RPCs, scoring or filter logic changes — this is styling, spacing and empty-state work only.

## What changes visually

### 1. Page header becomes a proper console header
- Title, Beta badge and one-line description sit inside a bordered header block with the tab strip attached beneath it, so the page reads as one surface rather than floating text.
- Description truncates to a single muted line on small widths.

### 2. Scope toolbar gets a real surface and label hierarchy
- The sticky toolbar sits on a card-like bar (`bg-card`, bottom border, subtle shadow when stuck) instead of bare page background, so it reads as a control strip.
- Each filter trigger gets a tiny uppercase label above it on desktop (Division / Business Unit / Department / Manager); "Review Period:" stops being the only labelled control.
- Filter triggers get a consistent width, height (h-9) and truncation so a long selection like "CPP" and "All business units" line up on a single baseline.
- Primary action ("Load console" / "Apply filters") keeps its emphasis; Refresh becomes an icon button with a tooltip.
- A scope summary line ("August 2026 · CPP · all departments · all managers") replaces the current bare breadcrumb when data is loaded.

### 3. Category tab strip stops looking cut off
- Fade masks on both edges plus small scroll-arrow affordances, so a strip that overflows (as in the screenshot, where "Maintenance & Rel…" is sliced) reads as scrollable rather than broken.
- Count pills become a muted tonal pill; the active tab keeps the underline plus a stronger weight.
- Strip is horizontally scrollable with keyboard arrow support and snap alignment.

### 4. KRA / KPI rows get column alignment and rhythm
- Metric columns (`KPI COUNT`, `EMPLOYEE IMPACT`, `AVG SCORE`) get fixed widths and right-aligned tabular numerals so rows stack into visible columns rather than drifting per row.
- Column labels move into a sticky list header row on `sm+`, so each row no longer repeats a tiny label above every number.
- Row hover/active gets a left accent bar; index chip gets a rounded muted square; chevron aligns to the far right on a fixed rail.
- Row height standardised (56px KRA / 64px KPI), matching the current virtualization estimates.

### 5. Empty and pre-load states
- Before a scope is applied: a centred empty state (icon, "Pick a scope to load the console", hint text) instead of a bare sentence.
- When a category has one KRA (the screenshot case) the list no longer looks like an error — the list header states the counts and the card keeps its full width.
- Loading uses row-shaped skeletons that match final row height, so nothing jumps when data lands.

## Accessibility / UX contract
- All rows, tabs and toolbar controls stay ≥44px touch targets.
- Category tabs remain a real tablist with roving focus.
- Status/emphasis is never colour-only; contrast ≥4.5:1 in both themes.
- Only semantic design tokens — no hardcoded colours; the amber "stale filters" and variant chips move onto existing warning tokens.
- Sticky toolbar reserves space so the first row is never hidden beneath it.

## Technical notes
- Files touched (presentation only):
  - `src/pages/admin/BuConsole.tsx` — header block, scope summary line, empty/loading states.
  - `src/components/admin/bu-console/ScopeToolbar.tsx` — surface, per-filter labels, control sizing.
  - `src/components/admin/bu-console/BuConsoleTree.tsx` — tab strip edge fades, list header row, card polish.
  - `src/components/admin/bu-console/ConsoleMetricRow.tsx` — fixed metric column widths, alignment, hover accent.
- No changes to `useBuConsole.ts`, RPC signatures, cascading filter rules (ADR-229), virtualization thresholds (ADR-264) or the dirty-scope behaviour (ADR-271).
- Regression guard: extend the existing console render test to assert the KRA row still exposes its name, KPI count and button role, and that the toolbar still collapses to a Filters trigger below `md`.
- DOCUMENTATION.md + ADR-277 record the console layout contract; POLICY.md unchanged (no business rule moves).

## Out of scope
KRA Tree and KPI Library tabs, drawer/dialog internals, and any data, scoring or permission behaviour.

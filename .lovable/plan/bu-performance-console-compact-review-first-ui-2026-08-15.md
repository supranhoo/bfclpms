# BU Performance Console — compact, review-first UI

The current console spends the whole first screen on a Scope card (4 stacked comboboxes + a Load button) and then shows a loose wrap of category chips. The reference layout is denser: a one-line scope header, category tabs with counts, and a compact KRA row list where the numbers that matter (KPI count, review status, KRA rating, employee impact) sit in fixed columns.

This is a presentation-only change. No RPC, no scoring, no goal logic changes.

## What changes visually

### 1. Scope becomes a single sticky toolbar (Console tab)
- Replaces the full-width Scope card.
- One row on desktop: Review Period (month + year) · Divisions · Business Units · Departments · Managers · **Load console** · Refresh.
- Each control is a compact trigger showing selection state ("All divisions", "CPP", "3 selected") — same `OrgFilterCombobox` and cascading rules (ADR-229), just smaller triggers.
- On tablet/mobile the filters collapse behind a single "Filters (n)" button opening a Sheet (reusing the existing TabletFilterSheet pattern); period selector and Load stay inline.
- The toolbar sticks to the top while the tree scrolls.
- The "nothing loads until you apply a scope" note becomes a slim inline hint instead of a card body.

### 2. Categories become a scrollable tab strip
- The wrapped chip grid is replaced by one horizontally scrollable tab row: `Production 7 · Costing 7 · Maintenance 7 …` with the count as a subtle pill and an underline on the active tab.
- Saves 2–3 rows of vertical space on wide category sets; no horizontal page scroll.

### 3. KRA list becomes a dense metric row list
Each KRA row (currently name + a badge) gets a fixed column layout:

```text
01  Asset Availability & Reliability     KPI COUNT   REVIEW STATUS   KRA RATING   EMPLOYEE IMPACT   >
    Standard KRA · 2 mapped KPIs             2         Provisional      — / 5             6
```

- Left: index chip, KRA name, muted sub-line (mapped KPI count).
- Right: labelled metric columns — tiny uppercase labels, values carry the emphasis.
- Row height ~64px, full row is the click target, chevron affordance on the right.
- Status uses a semantic token colour **plus** the text label (never colour alone).
- On tablet/mobile the columns reflow into a 2×2 metric grid inside the row.
- Virtualization above 40 rows is kept exactly as-is.

### 4. KPI list + header polish
- KPI rows adopt the same compact two-line + right-metric treatment so drill levels feel consistent.
- Page header condenses: title + Beta badge on one line, description on a single muted line, Refresh moves into the scope toolbar.
- A breadcrumb line (Category → KRA → KPI) appears under the tabs once a drill level is selected, so users can step back without scrolling.

### 5. Theming
- Stays on the existing semantic design tokens so it follows the app's current theme and dark mode. The dark palette in the reference is treated as inspiration for **density and hierarchy**, not as a new hardcoded colour scheme.

## Accessibility / UX contract
- All interactive rows and toolbar controls keep a ≥44px touch target.
- Category tabs are a real Tabs roving-focus control (keyboard arrow navigation).
- Status conveyed by label + icon, not colour alone; contrast ≥4.5:1.
- Sticky toolbar reserves space so the first KRA row is never hidden underneath.

## Technical notes
- Files touched:
  - `src/pages/admin/BuConsole.tsx` — scope toolbar, sticky header, breadcrumb.
  - `src/components/admin/bu-console/BuConsoleTree.tsx` — category tab strip, dense KRA/KPI rows.
  - New `src/components/admin/bu-console/ScopeToolbar.tsx` — extracted filter cluster.
  - New `src/components/admin/bu-console/ConsoleMetricRow.tsx` — reusable dense row (KRA + KPI).
- No changes to `useBuConsole.ts` hooks, RPC signatures, or cascading filter logic.
- Metric columns render from values already on the tree nodes; absent values show `—` (no fabricated numbers).
- Regression guard: a render test asserting the KRA row exposes name, KPI count and a button role, and that the scope toolbar collapses to a Filters trigger below `md`.
- DOCUMENTATION.md / POLICY.md updated with the console layout contract (ADR-268).

## Out of scope
Goals and KPI Library tabs keep their current layout in this pass; they can follow the same row pattern once the Console tab is signed off.
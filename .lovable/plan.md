# Performance Console — make it read as a product, not a wireframe

The structure is right but there is no visual substance: a wide empty canvas, flat grey rows, numbers with no meaning attached, and no sense of "how is this BU doing". This pass adds signal, hierarchy and density. Presentation only — no data, RPC, scoring or filter-logic change.

## What changes visually

### 1. Scope summary becomes a stat band
Under the toolbar, replace the thin breadcrumb text line with a compact tile band computed from the already-loaded tree:
- Categories · KRAs · KPIs · Employees impacted
- Average score across loaded KPIs, shown as a colour-tinted score chip
- Each tile: small label, large tabular number, muted context line
The drilldown breadcrumb (Category > KRA) moves to a slim crumb line above the tab strip, so it stops competing with the scope summary.

### 2. Scores stop being plain text
- New `ScorePill` component: tinted pill (destructive / warning / success tokens) with the value in tabular numerals, banded against the KPI scale.
- KRA rows show a micro progress bar for average score next to the pill, so a row communicates health at a glance instead of reading "—".
- "Employee impact" becomes a count chip with a Users icon so the number reads as people, not an abstract metric.

### 3. Rows get weight and rhythm
- Index chip becomes a filled rounded square; KRA title moves to a heavier 15px semi-bold; subtitle reads `n KPIs · n employees`.
- The expanded row takes a primary-tinted surface so it visibly owns the panel below it.
- The expanded panel gains a top inner shadow and a vertical tree rail connecting KPI rows to the parent row, instead of a plain indent.

### 4. Category strip reads as navigation
- Tabs become pills on a muted track; the active pill uses the primary surface and its count pill inverts.
- Left/right scroll arrow buttons appear only when the strip actually overflows.

### 5. The empty canvas gets filled
- On `xl+`, the KRA list is paired with a "Category at a glance" side panel: top KPIs by employee impact, score spread, and counts of unsplit / possible-duplicate titles. It stacks above the list below `xl`.
- The pre-load state shows the same stat-band shell in a muted placeholder state, so the page has structure before anything is loaded.

### 6. Loading and micro-states
- Skeletons mirror the stat band and row heights exactly, so nothing jumps when data lands.
- The row "Open" affordance is revealed on hover/focus instead of always showing, reducing noise.
- All motion respects `prefers-reduced-motion`.

## Standards contract
- Semantic tokens only (`bg-card`, `text-muted-foreground`, `border-border`, warning/success/destructive). No hex values, no emojis, lucide icons only.
- Rows, tabs and controls stay >=44px touch targets; focus rings untouched; icon-only buttons keep `aria-label`.
- Existing virtualization and paging behaviour unchanged.

## Technical notes
Files touched (presentation only):
- `src/pages/admin/BuConsole.tsx` — stat band, crumb line, side-panel grid, placeholder states.
- `src/components/admin/bu-console/BuConsoleTree.tsx` — pill tab strip, scroll arrows, tree rail, panel depth, side panel.
- `src/components/admin/bu-console/ConsoleMetricRow.tsx` — score pill / micro-bar slots, heavier title scale, hover-revealed trailing.
- New `src/components/admin/bu-console/ConsoleStatBand.tsx` and `ScorePill.tsx`.

No change to `useBuConsole.ts`, RPC signatures, cascading filter rules (ADR-229), virtualization thresholds (ADR-264), dirty-scope behaviour (ADR-271) or inline KPI expansion (ADR-278).

## Risk & impact
- Data impact: none. Scalability: the stat band is one memoised reduce over the already-fetched tree; the side panel slices the top 5 only.
- Regression risk: low — `consoleLayout.test.tsx` extended to assert the stat band renders its counts, the KRA row still exposes name / KPI count / `aria-expanded`, and the toolbar still collapses to a Filters trigger below `md`.
- Rollback: revert the touched presentation files; no migration involved.

## Docs
ADR-279 records the console visual language; DOCUMENTATION.md updated. POLICY.md unchanged (no business rules move).
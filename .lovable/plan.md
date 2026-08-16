# Performance Console — reclaim vertical space above the work area

Today roughly 460px of the viewport is spent on chrome before a single KPI row is visible: title card, tab strip, filter card, five-tile stat band, a breadcrumb that repeats the scope, then the category strip. On a 772px-tall window that leaves under a third of the screen for the actual work. The fix is compaction and de-duplication, not removal — every control stays reachable.

## What changes visually

```text
BEFORE (~460px of chrome)              AFTER (~210px of chrome)
+--------------------------------+     +------------------------------------------+
| Performance Console Beta blurb |     | Perf. Console Beta | Console KRA KPI Lib  |
+--------------------------------+     | 17 cat · 51 KRA · 100 KPI · 527 · 3.68    |
| Console | KRA Tree | KPI Library|    +------------------------------------------+
+--------------------------------+     | Aug 2026 · CPP · 2 filters   [Apply] [⟳] |
| REVIEW PERIOD DIV BU DEPT MGR  |     +------------------------------------------+
+--------------------------------+     | Aug 2026 · CPP > Audit | Compliance 9 ... |
| 5 large stat tiles             |     +------------------------------------------+
+--------------------------------+     | KRA rows start here                       |
| Aug 2026 · CPP · ... > Audit   |
| Audit 1 | Compliance 9 | ...   |
```

1. **Header collapses into one ~56px bar.** Title and Beta badge on the left, the three tabs inline on the right, the descriptive sentence moved to a tooltip on the Beta badge. Saves about 60px.
2. **Stat band becomes a single-line strip.** The five tiles turn into one horizontal run of compact `label value` chips (Categories 17 · KRAs 51 · KPIs 100 · Employees 527 · Avg with its score pill). Icons drop to small inline glyphs and the "distinct employees in scope" caption moves to a tooltip. Height goes from about 90px to about 36px, and it sits inside the header block so it no longer costs a separate card.
3. **Breadcrumb merges into the category strip row.** The applied scope reads as muted text at the left of the strip with the drill path after it, instead of occupying its own line.
4. **Filter row stays one line and gains a collapsed state.** Once a scope is loaded and the user scrolls, the sticky filter bar shrinks to a summary chip row ("August 2026 · CPP · 2 filters — Change") that expands on click. The stacked field captions move into the combobox placeholders, so each control is one row rather than caption plus control.
5. **Denser page rhythm.** Page padding `p-4 sm:p-6` to `p-3 sm:p-4` and block gap `space-y-4` to `space-y-2`. Tree row height is left alone — readability wins over density in the data area.

Nothing is hidden without an affordance: the subtitle, the employees caption and the collapsed filters each keep a visible control or tooltip.

## Interaction and responsiveness

- Collapse is driven by scroll position (an IntersectionObserver sentinel), never by a timer, and is disabled while filters are dirty so the "Apply filters" call to action always stays visible.
- Below `md` the existing Filters sheet is unchanged; the stat strip scrolls horizontally with snap points instead of wrapping onto three lines.
- Apply / Refresh / Change keep 44px touch targets — only the caption text is removed, never the hit area.
- The amber dirty-state warning stays but becomes an inline chip in the same row rather than an extra paragraph.

## Technical detail

- `src/pages/admin/BuConsole.tsx` — merge header and tabs, host the stat strip in the header block, fold the breadcrumb into the strip row, tighten spacing.
- `src/components/admin/bu-console/ConsoleStatBand.tsx` — add a `variant="strip"` rendering inline chips; the existing tile layout stays for the pre-scope placeholder. `computeConsoleStats` is untouched, so the ADR-281 distinct-employee rule is preserved.
- `src/components/admin/bu-console/ScopeToolbar.tsx` — collapsed state plus sentinel, labels into placeholders, dirty hint as an inline chip.
- `src/components/admin/bu-console/BuConsoleTree.tsx` — `CategoryStrip` gains a leading `context` slot for the scope and breadcrumb text.
- Semantic tokens only (`text-muted-foreground`, `bg-card`, `--warning`); no new colours, no raw hex.

## Risk and impact

- Data and workflow: none. Presentation only — no query, RPC, or state-shape change.
- Regression risk: low to moderate, concentrated in the sticky collapse behaviour. Mitigated by never collapsing while dirty and by leaving the mobile sheet path as it is.
- Scalability: unchanged; the strip reads the same memoised stats object.
- Rollback: revert the four presentation files; nothing is persisted.

## Tests

- Extend `consoleLayout.test.tsx` — the strip variant renders all five metrics, still uses the server distinct total, and the breadcrumb text renders inside the category strip row.
- New `scopeToolbar.test.tsx` — collapsed toolbar shows the summary chip, refuses to collapse while dirty, and keeps Apply reachable in both states.

## Documentation

- ADR-283 — Performance Console information density, plus POLICY §CONSOLE-CHROME-BUDGET: chrome above the first data row must stay under roughly 220px at 1280x800, and any new summary must extend the existing strip rather than add another card.
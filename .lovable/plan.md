## Goal
Redesign the Bulk Review toolbar as a **truly planned 2-row sticky header** with strict grid rhythm. Fix the 3 issues visible in the current build: orphan counters row, inconsistent select widths causing "All Business Units" wrap, and dead space in Row 1.

## Layout

### Row 1 — `h-12`, identity + search + actions
```
[≣ Bulk Review · Beta · 139 emp · 2139 KPI · ~167KB]   [🔍 Search KPI / Employee ───────────────]   │  [👤 Manager ▾]  [⚡ Load Scope (2)]  [↻]
```
- **Title chip** absorbs the counters as small muted inline text (no separate strip)
- **Search** uses `flex-1` so it fills all empty mid-space
- **Right action cluster** separated by `border-l border-border/50 pl-3`
- `Load Scope` carries the active-filter count as a `Badge` suffix

### Row 2 — `h-11`, filters in a strict **7-column grid** + view pill
```
┌─Month──┬─Year───┬─Company─┬─Division─┬─BU──────┬─Dept────┬─Cat─────┐  │  [Wt% | Score | Both] [👁]
│ 📅 May │ 📅 2026│🏢 All Co│🌐 All Di │🏭 All BU│👥 All De│🏷 All Ca │
└────────┴────────┴─────────┴──────────┴─────────┴─────────┴─────────┘
```
- Container: `flex items-center gap-2 px-4 h-11 bg-muted/30`
- Inner: `<div className="grid grid-cols-7 gap-2 flex-1">` — every filter cell is **equal width**, no wrap possible
- Each select: `w-full h-8 text-xs justify-start` with leading Lucide icon + truncated placeholder
- View-mode pill sits **outside** the grid (`ml-2 border-l pl-2`), so it never steals from filter rhythm
- Short placeholders: `Month`, `Year`, `Company`, `Division`, `BU`, `Department`, `Category` (Company hidden if only 1)

### Responsive cascade
| Breakpoint | Row 2 grid |
|---|---|
| ≥1280px | `grid-cols-7` (all inline) |
| ≥1024px | `grid-cols-4` (2 visual rows) |
| ≥640px  | `grid-cols-3` |
| <640px  | `grid-cols-2` |

View-pill stays right-anchored at all sizes; drops below the grid on `<sm`.

## Container
- `sticky top-0 z-30 bg-background/95 backdrop-blur border-b shadow-sm`
- Row 1 `border-b border-border/40` divider → adds the "designed" feel
- Row 2 subtle `bg-muted/30` band → groups filters visually

## Structural rules (the "planned" feel)
1. **One vertical rhythm** — `h-12` then `h-11`. Total header = 92px sticky.
2. **One icon size** everywhere on the bar: `h-3.5 w-3.5 text-muted-foreground`.
3. **One control height** per row (Row 1 = `h-9`, Row 2 = `h-8`).
4. **One divider style** — `border-l border-border/50 pl-3` for every section break.
5. **Truncate, never wrap** — every select trigger gets `truncate` on its inner span.
6. Counters live as `text-[11px] text-muted-foreground` next to the title — never on a 3rd row.

## Files
- `src/pages/review/BulkReviewDashboard.tsx` — replace the sticky header JSX block only

## Risk & Impact
- **Data / Workflow / Security**: none
- **UI**: pure refactor of the toolbar
- **Regression**: low — state/handlers/RPCs untouched
- **Rollback**: revert single file

## Verification (@1431px from screenshot)
- 2 rows total — no 3rd counters strip
- "All Business Units" fits on one line
- No empty gap in Row 1 — search fills it
- View-mode pill aligned with filter row baseline
- Tab order: title → search → stage → Load Scope → refresh → Month → Year → … → Category → view mode

## Docs
- `DOCUMENTATION.md` v2.66.12.4: "Bulk Review toolbar redesigned to a true 2-row grid layout — counters merged into title chip, 7-column uniform filter grid (`grid-cols-7`), anchored search fills Row 1, view-mode pill outside grid."
- `POLICY.md`: no change

Used the **ui-ux-pro-max** skill.

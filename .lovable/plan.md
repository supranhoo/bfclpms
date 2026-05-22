## Reproduced bugs (browser-tested at 1366×768, dark mode)

### Bug 1 — Page-level horizontal overflow → sidebar bleeds through matrix
The matrix scroll wrapper `<div className="overflow-auto max-h-[68vh] relative">` has **no width constraint**. With 132 employees × 64px columns, the natural table width (~8500px) blows past the viewport. Because the wrapper has no `w-full`/`max-w-full`, `overflow-auto` never activates horizontally — the table pushes its `Card` → `CardContent` → `SidebarInset` parent chain wider, the whole **document body** becomes scrollable horizontally, and the sidebar (which sits in the same CSS grid) is shoved off-screen left. The dark-mode visual artifact ("sidebar text showing through table") is just the sidebar peeking out from under the over-wide table.

### Bug 2 — Employee avatar tooltip mis-placed
Hovering an avatar in the sticky `<thead>` shows the name/grade tooltip pinned to the **top-left of the matrix area**, far from the avatar, partly clipped by the page header. Radix Tooltip has no explicit `side`/`sideOffset`/`collisionPadding`/`avoidCollisions`, and its collision math breaks for triggers inside `position: sticky` thead with an overflow ancestor.

### Bonus — KRA band hover has no affordance
The KRA sub-band truncates long names (`truncate` + `maxWidth`) but has no tooltip on hover, so the full name is unreadable. The user's "feels broken" complaint about KRA hover.

## Risk & impact

- **Data impact:** None — presentation only.
- **Workflow impact:** None.
- **Regression risk:** Low. Changes are CSS width constraints + Tooltip positioning props + wrapping one band in a Tooltip.
- **Mitigation:** After patch, re-test with browser tool: load matrix → confirm no page-level horizontal scrollbar, sidebar stays put, avatar tooltip anchors below avatar, KRA hover shows tooltip with full name.

## Fixes (single file: `src/pages/reports/KpiEmployeeMatrix.tsx`)

### Fix 1 — Contain matrix width
- Change the scroll wrapper to `className="w-full max-w-full overflow-auto max-h-[68vh] relative"`.
- Add `min-w-0` to `<CardContent className="p-0 min-w-0">` so the CSS-grid `SidebarInset` doesn't let its child expand past the track. (Standard CSS-grid `min-width: auto` defense.)

### Fix 2 — Employee tooltip positioning
- On the avatar header `<TooltipContent>`, add `side="bottom"`, `sideOffset={8}`, `align="center"`, `collisionPadding={12}`, and `className="z-50"` (above the sticky thead z-30).
- Same hardening on the KPI row tooltip for consistency.

### Fix 3 — KRA band tooltip
- Wrap the KRA sub-band content in `<Tooltip>` with the full KRA name + KPI count visible on hover. The trigger stays the same `<div>` so the click-to-collapse behavior is preserved.

### Cleanup — Remove the scroll→Escape side-effect
The `useEffect` I added in the previous round dispatches a global `Escape` keydown on every matrix scroll. This is too broad — it can close unrelated Radix surfaces (sidebar sheet on mobile, open popovers, dropdowns). Replace it with a scoped approach: only call `document.dispatchEvent` if a Radix tooltip is currently open (check for `[data-radix-tooltip-content]` in the DOM). This keeps the dismiss-on-scroll behavior without the side-effects.

## Verification (will run after patch)

1. Reload `/reports/kpi-employee-matrix` in browser tool, click **Load Matrix**.
2. Assert: no horizontal scrollbar on the page body (only inside the matrix wrapper). Sidebar fully visible, no text bleed-through.
3. Hover employee avatar → tooltip anchors directly below the avatar, fully visible.
4. Hover KRA band → tooltip shows full KRA name and KPI count.
5. Scroll the matrix → no other UI surfaces (sidebar, popovers) close.

## Out of scope
- No changes to data hooks, RPCs, or scoring logic.
- No redesign of the layout — purely defect fixes + one missing tooltip.

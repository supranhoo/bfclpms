# Plan — Visible, centered Refresh indicator (rocket + growth chart)

## Problem
On the reviewer grid (`EmployeeSelectorGrid`), clicking **Refresh** only spins the small icon inside the top-right button. Users miss it and think nothing is happening. The user wants:
1. A clearly visible refresh indicator
2. Positioned in the **center of the screen**
3. Styled like the uploaded image — a **rocket launching along a rising green growth chart** (success / "data being refreshed and improved" feel)

## Solution Overview
Build a reusable centered overlay component `RefreshOverlay` that renders an animated rocket-on-growth-chart SVG with a "Refreshing data…" caption, and show it whenever the reviewer grid's tracked queries are refetching (`isRefreshing` already exists in `EmployeeSelectorGrid.tsx`).

The small spinner in the Refresh button stays (gives button-level feedback + disabled state), but the heavy lifting of "is something happening?" moves to the centered overlay.

## What to Build

### 1. New component — `src/components/ui/RefreshOverlay.tsx`
- Fixed-position overlay: `fixed inset-0 z-[60] flex items-center justify-center`
- Semi-transparent backdrop (`bg-background/70 backdrop-blur-sm`) so the page is dimmed but still visible
- Centered card with:
  - Inline animated SVG: axes (X/Y), three rising green arrows of increasing height, and a rocket at the tip of the tallest arrow — matching the reference image's palette (deep navy axes/rocket body, vibrant green `#22c55e`-ish arrows, soft mint glow)
  - Subtle motion: rocket gently translates up-right + small flame flicker, arrows fade-in sequentially (pure CSS keyframes via Tailwind `animate-*` utilities + a small `<style>`-less inline `@keyframes` in `index.css`)
  - Caption: **"Refreshing data…"** + sub-line **"Fetching the latest scores and assignments"**
- Props: `open: boolean`, optional `label?: string`
- Accessibility: `role="status"`, `aria-live="polite"`, `aria-label="Refreshing data"`
- Respects `prefers-reduced-motion` (disables transforms, keeps static icon)

### 2. Add keyframes — `src/index.css`
Add `@keyframes rocket-launch`, `rocket-flame`, and `arrow-rise` plus utility classes (`.animate-rocket-launch`, etc.) so the SVG animates without extra deps.

### 3. Wire into reviewer grid — `src/components/review/EmployeeSelectorGrid.tsx`
- Import `RefreshOverlay`
- Render `<RefreshOverlay open={isRefreshing} />` near the top of the returned JSX
- Keep existing button spinner for inline feedback
- Show the overlay **only when refresh was user-triggered or any tracked query is actively refetching** (current `isRefreshing` already covers this)

### 4. Documentation & policy sync (per project rules)
- `DOCUMENTATION.md` — add entry under UI components: "RefreshOverlay — centered branded refresh indicator used by reviewer grid"
- `POLICY.md` — add a short UX policy: "All long-running refresh actions affecting the primary data view must surface a centered overlay indicator, not just an inline spinner"
- Append to Version History
- Add a memory file `mem://design/refresh-overlay-pattern` describing when to use it

### 5. Regression test
Add `BUG-030` to `src/test/bugBountyFixes.test.ts`:
- Renders `RefreshOverlay open={true}` → overlay visible with `role="status"` and label
- Renders `RefreshOverlay open={false}` → not in DOM

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | None — purely presentational |
| Workflow | None — refresh behavior unchanged |
| UI/UX | New overlay appears during refetch; dims page briefly. Mitigated by translucent backdrop + auto-dismiss when fetches settle |
| Regression | Low. Only `EmployeeSelectorGrid` is wired in this pass. Existing button spinner preserved |
| Accessibility | Improved — adds `role="status"` + reduced-motion support |
| Mitigation | New unit test, scoped CSS keyframes (prefixed), component is opt-in per page |

## Files to Change
- **Add** `src/components/ui/RefreshOverlay.tsx`
- **Edit** `src/index.css` (keyframes)
- **Edit** `src/components/review/EmployeeSelectorGrid.tsx` (mount overlay)
- **Edit** `src/test/bugBountyFixes.test.ts` (BUG-030)
- **Edit** `DOCUMENTATION.md`, `POLICY.md`
- **Add** `mem://design/refresh-overlay-pattern` + update `mem://index.md`

## Out of Scope (ask if you want them next)
- Rolling out the same overlay to other pages (Reports, Admin grids, Inbox). Easy follow-up once the component exists — say the word.

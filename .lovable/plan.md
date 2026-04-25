# Simplify Loading Art — Rocket-only "Please wait"

## What you'll see

The centered page-loading overlay (used during page navigation and initial data fetches) will be redesigned. The X/Y axes, the green growth-chart arrows and the soft green ellipse will all be **removed**. In their place, a single **rocket** will animate **upward** with a small flame trail. The caption stays: **"Please wait"** with sub-caption **"Loading…"**.

## Visual mock (ASCII)

```text
 ┌─────────────────────────────┐
 │                             │
 │              🚀  ← rises    │
 │             ╱               │
 │            ╱  (motion       │
 │           ╱    trail,       │
 │          ✦     subtle)      │
 │                             │
 │       Please wait           │
 │         Loading…            │
 └─────────────────────────────┘
```

- Rocket: navy body (`#0E2A47`), green fins (`#22C55E`), tinted window (`#86EFAC`), orange flame (`#FB923C`).
- Motion: rocket translates upward in a gentle loop (≈40px travel, 1.6s ease-in-out, infinite). Flame flickers. A faint dotted trail fades in below the rocket as it rises, then resets.
- Honors `prefers-reduced-motion`: animation pauses, rocket sits centered.
- Container (rounded card, border, shadow, blur backdrop) and "Please wait / Loading…" typography are unchanged.

## Where it appears

No change to gating logic — same two triggers as today:
1. `Suspense` fallback for route lazy-loading (`DashboardLayout.tsx`).
2. `RouteDataLoadingGate` while `useIsFetching() > 0` after a `pathname` change.

Refresh button behavior unchanged (inline spinner only, per POLICY.md §103).

## Technical changes

| File | Change |
|---|---|
| `src/components/ui/RocketGrowthArt.tsx` | Rename internals / rewrite SVG: remove axes (`<line>` x/y, arrowheads), remove ellipse, remove all three `rg-arrow` groups. Keep only the rocket + flame. Reposition rocket to center of a tighter `viewBox` (e.g. 120×140). Rename component to `RocketLaunchArt` and re-export old name as alias for backwards compatibility. |
| `src/index.css` | Remove unused `rg-arrow-rise` keyframe and `.rg-arrow*` classes. Replace `rg-rocket-launch` keyframe with an upward-travel loop (translateY from +20px → −20px with fade reset, or continuous loop with opacity dip at top). Keep `rg-flame-flicker` and `prefers-reduced-motion` guard. |
| `src/components/ui/PageLoadingOverlay.tsx` | No structural change; just consumes the simplified art. |
| `src/components/ui/RefreshOverlay.tsx` | Already deprecated; will pick up the new art automatically via the shared component (no edit needed). |
| `src/test/bugBountyFixes.test.ts` | Add **BUG-034**: assert `RocketGrowthArt.tsx` no longer references axes / arrow markup (`rg-arrow`, the polygon arrowheads, the growth-chart `<line>` strokes) and that the rocket+flame remain. |
| `DOCUMENTATION.md` | v2.66.7.36 entry describing the simplified art. |
| `POLICY.md` | Minor note under §103 — loading indicator art is "rocket ascending"; growth-chart arrows removed for clarity. |
| `mem/design/page-loading-overlay-pattern` | Update description to reflect rocket-only art. |

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | None (purely presentational SVG + CSS) |
| Workflow | None |
| UI/UX | Cleaner, less busy loading state; identical placement, container, and copy |
| Accessibility | Maintained — `role="status"`, `aria-live`, `prefers-reduced-motion` |
| Performance | Slightly lighter SVG and fewer animated nodes |
| Regression | Low. Both overlays import the same shared component; new test pins the markup contract |
| Mitigation | BUG-034 regression test + memory/doc/policy updates |

## Out of scope

- Changing the caption text, container chrome, or gating logic.
- Touching the refresh button's inline spinner.


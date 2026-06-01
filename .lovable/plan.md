
# Module Hub — Premium HRMS Suite Redesign (UI/UX only)

Pure presentation polish. No changes to auth, routing, module fetching, permissions, RLS, schema, or business logic. `useModules`, `useAuth`, route paths, and Coming Soon click-guards stay byte-identical.

## Scope (files touched)

1. `src/pages/ModuleHub.tsx` — layout, welcome block, optional grouping wrapper.
2. `src/components/modules/ModuleCard.tsx` — premium tile treatment, icon container, hover/disabled states.
3. `src/components/layout/MinimalHeader.tsx` — refined spacing, subtle elevation, balanced alignment.
4. (Optional, additive) `src/components/modules/ModuleGroup.tsx` — small presentational wrapper for product-family headings. Only added if grouping renders cleanly; otherwise skipped.

No new routes, hooks, contexts, tokens files, or dependencies. Uses existing semantic tokens in `index.css` (`--background`, `--card`, `--primary`, `--muted`, `--border`, shadow vars). No hardcoded hex.

## Visual direction

- **Background:** layered neutral surface — base `bg-background` + a faint top-to-bottom panel (`bg-card/40` blurred band) and the existing radial primary tint already in `body`. No blobs, no loud gradients.
- **Header:** keep all elements. Tighten to `h-16`, add `backdrop-blur` + `bg-background/80` + `border-b border-border/60` + `shadow-sm` for a sticky-feeling enterprise bar. Logo block gets a subtle ring; org-name row uses tracking-wide uppercase micro-label for that SuccessFactors/Workday tone.
- **Welcome block:** left-aligned on ≥sm (centered on mobile). H1 `text-2xl sm:text-3xl font-semibold tracking-tight` — "Welcome back, {firstName}". Sub `text-sm text-muted-foreground` — "Access your HRMS workspace". A thin divider/eyebrow chip ("Your workspaces · {n} available") replaces the marketing-style centered hero.
- **Module cards:** 
  - Surface: `bg-card` with `border border-border/60`, `rounded-xl`, `shadow-sm`, hover → `shadow-lg`, `border-primary/40`, translate-y `-2px` (no scale jump).
  - Icon: 48px rounded-xl container with `bg-primary/8` ring-1 `ring-primary/15`; icon `h-6 w-6 text-primary`. On hover the container fills to `bg-primary text-primary-foreground` with a soft glow (`shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.35)]`).
  - Title: `text-lg font-semibold tracking-tight`. Description: `text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]` so all cards align.
  - Footer row inside card: small "Open workspace →" affordance (muted, slides on hover) — only for active cards.
  - Coming Soon: muted surface (`bg-muted/40`), icon container desaturated (`bg-muted text-muted-foreground`), refined pill badge top-right (`border border-border bg-background/80 text-[10px] uppercase tracking-wider`), cursor not-allowed, no hover lift, `aria-disabled`. Click handler unchanged (already guarded).
- **Grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3` with `gap-5 lg:gap-6`. Container `max-w-6xl` so cards don't stretch awkwardly on ultra-wide.
- **Grouping (light-touch):** Group the rendered modules by family using a small client-side map keyed off `module.code` → family label. Families: Core HRMS, Performance & Growth, Safety & Compliance, Learning & Development, Future Modules. Each group renders a small eyebrow row (`text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground` + thin `border-t`) above its grid. If a family has 0 cards it's not rendered. Mapping lives in a const inside `ModuleHub.tsx` — derived from existing `code` values, no DB change. Unknown codes fall back to "Workspaces" so future modules render safely without code changes to the layout.
- **Motion:** Tailwind `transition-all duration-300 ease-out`. Stagger entry with a 50ms-per-card CSS delay (no framer-motion dep added).

## Layout sketch

```text
┌──────────────────────────────────────────────────────────────┐
│ [logo] AppName                          [theme] [avatar ▾]   │  ← refined header
│        Org · uppercase micro-label                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Welcome back, Anita                                          │
│  Access your HRMS workspace                                   │
│  ─── 6 workspaces available                                   │
│                                                               │
│  CORE HRMS ─────────────────────────────────────              │
│  ┌────────┐ ┌────────┐ ┌────────┐                            │
│  │ [icon] │ │ [icon] │ │ [icon] │                            │
│  │ Title  │ │ Title  │ │ Title  │                            │
│  │ desc   │ │ desc   │ │ desc   │                            │
│  │ Open → │ │ Open → │ │ Open → │                            │
│  └────────┘ └────────┘ └────────┘                            │
│                                                               │
│  PERFORMANCE & GROWTH ──────────────────────                 │
│  ┌────────┐                                                   │
│  │  PMS   │                                                   │
│  └────────┘                                                   │
│                                                               │
│  FUTURE MODULES ────────────────────────────                 │
│  ┌────────┐ ┌────────┐    (Coming Soon, muted)               │
│  │ HRMS   │ │ LMS    │                                        │
│  └────────┘ └────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

## What stays untouched

- `useModules` query, realtime channels, Safety access RPC.
- Route values, `navigate(route)` behavior, `isComingSoon` gating.
- Module list source (DB-driven) and the two hardcoded Coming Soon placeholders already in `ModuleHub.tsx`.
- `MinimalHeader` data, sign-out, dropdown items, theme toggle behavior.
- All tokens defined in `index.css` and `tailwind.config.ts`.

## Risk & impact

- **Data:** none.
- **Workflow:** none.
- **UI/UX:** improved hierarchy, more whitespace; mobile stacks single-column (already does).
- **Regression risk:** low — three presentational files; no prop signatures change.
- **Scalability:** family-map falls back gracefully for new module codes; grid uses `auto-fit`-friendly column classes.
- **Rollback:** revert the three files.

## Acceptance check (post-build)

- Active cards still navigate via `navigate(route)`.
- Coming Soon cards still no-op and show the pill.
- Header still shows logo / app name / org / theme / profile / sign-out.
- Grid responsive at 320 / 768 / 1024 / 1440.
- No new console errors, no token violations (no raw hex in components).

## Docs (per project SSOT rule)

- `DOCUMENTATION.md` — append "Module Hub visual refresh" note under UI section, no behavior changes called out.
- `POLICY.md` — Not Applicable (no policy/business-logic change).
- Memory — Not Applicable (cosmetic; no new invariants).

Awaiting approval to implement.

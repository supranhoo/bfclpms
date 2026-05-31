
# UI Polish Pass — Galaxy S-inspired Premium Feel

**Scope:** Pure visual/UX polish via the global design system + shared shadcn primitives. **No** business logic, routes, RLS, queries, schema, scoring, workflow, permissions, or page layouts touched. All page files keep their current structure.

## Risk & Impact Report

- **Data / Workflow / Permissions:** None. CSS + className changes only.
- **UI/UX:** Intentional global visual shift — softer surfaces, smoother shadows, refined typography.
- **Regression Risk:** Low. Changes are limited to `index.css` (tokens) + ~6 shadcn primitives (`card`, `button`, `tabs`, `table`, `input`, `select`) + `DashboardLayout` background + `AppSidebar` spacing/hover. All variant names + APIs unchanged.
- **Responsive:** Mobile sm/lg breakpoints preserved; new shadows/radii are token-driven and theme-aware (light + dark).
- **Mitigation:** Tokens only — every page automatically inherits. Rollback = revert ~8 files.

## Plan

### 1. `src/index.css` — token refinement (the heart of the change)
- **Background** — replace flat `209 40% 96%` with a softer layered surface: `--background: 220 25% 98%` light / `222 40% 9%` dark. Add a very subtle radial accent on `body` (`bg-background` + low-opacity radial gradient using primary at ~3% — barely visible, premium feel).
- **Card** — `--card` to pure-white-ish in light (`0 0% 100%`), elevated dark (`222 32% 14%`). Border softened to `220 20% 92%` light.
- **Radius** — bump `--radius` from `0.5rem` → `0.75rem` (enterprise-appropriate, not cartoonish).
- **Shadows** — replace flat `--shadow-*` with layered, premium shadows:
  - `--shadow-sm: 0 1px 2px hsl(220 40% 20% / 0.04), 0 1px 3px hsl(220 40% 20% / 0.03)`
  - `--shadow-md: 0 2px 6px -1px hsl(220 40% 20% / 0.06), 0 4px 12px -2px hsl(220 40% 20% / 0.05)`
  - `--shadow-lg: 0 8px 24px -6px hsl(220 40% 20% / 0.08), 0 16px 32px -8px hsl(220 40% 20% / 0.06)`
- **Muted/border** — slightly cooler & lighter for cleaner separation.
- **Typography** — add `font-feature-settings: "cv11","ss01","ss03"` + `-webkit-font-smoothing: antialiased` + `text-rendering: optimizeLegibility` on `body`. Tighten heading tracking (`letter-spacing: -0.01em` on h1–h3 via base layer).
- **Motion** — add a global `transition-colors` default duration var `--motion-fast: 150ms`, `--motion-base: 200ms` (used by primitives below).
- **Scrollbar** — apply the existing `matrix-scroll` thin-scrollbar treatment globally to `body` via a subtle override (kept opt-in feel, not loud).

### 2. `src/components/layout/DashboardLayout.tsx`
- Change `<main>` background from `bg-muted/30` → `bg-background` (which now carries the soft surface), keep padding tokens.

### 3. Shared primitives — small className upgrades, **no API changes**

| File | Change |
|---|---|
| `ui/card.tsx` | `shadow-sm` → `shadow-sm hover:shadow-md transition-shadow duration-200`; border `border-border/60`; default radius inherits new `--radius`. |
| `ui/button.tsx` | Add `transition-all duration-200 active:scale-[0.98]`; primary gets `shadow-sm hover:shadow-md`; outline gets `border-border/80 hover:border-border`. Sizes unchanged. |
| `ui/tabs.tsx` | `TabsList` → `bg-muted/60 p-1 rounded-lg`; `TabsTrigger` active state gets `shadow-sm` + smoother `transition-all duration-200`, weight `font-medium` → `font-semibold` when active. |
| `ui/table.tsx` | Header `bg-muted/40 text-xs font-semibold uppercase tracking-wide`; rows `hover:bg-muted/40 transition-colors`; cell padding tightened to `px-4 py-3` for denser scan. |
| `ui/input.tsx` | `bg-background` → `bg-card`; add `transition-colors`; focus ring uses `ring-2 ring-ring/30 ring-offset-0` (softer). |
| `ui/select.tsx` (trigger) | Same focus/ring polish as input for consistency. |

### 4. `src/components/layout/AppSidebar.tsx` (cosmetic only)
- Header: `p-4` → `px-4 py-5`, slightly larger logo container radius.
- Active menu item: use `bg-sidebar-accent/15 text-sidebar-primary font-medium` with a 2px left accent bar via `before:` pseudo for tactile feel.
- Section labels: `text-[11px] uppercase tracking-wider font-semibold text-sidebar-foreground/50`.
- Footer profile card: lift with new `shadow-sm` and rounded-lg.
- All menu items, badges, behavior **unchanged**.

### 5. `tailwind.config.ts`
- No structural change — shadow tokens already wired to CSS vars; new shadow values flow automatically.

## What is NOT changing

- No page-file edits (Dashboard, HR PMS Review, Team Reviews, Admin pages, Reports, KPI Details).
- No new dependencies.
- No color palette overhaul — primary/secondary/destructive hues kept.
- No animation libraries added.
- No layout/grid changes.

## Verification

- Visual: spot-check `/dashboard`, `/admin`, `/admin/settings`, a report page, and a table-heavy page in light + dark mode at desktop + mobile.
- Build: existing typecheck/lint must pass; no API change in primitives.
- Reduced-motion: all added transitions are `transition-colors`/`shadow` (already respected by browser when prefers-reduced-motion is on for our short durations); active scale is `0.98` only — acceptable.

## Rollback

Revert these files: `index.css`, `DashboardLayout.tsx`, `AppSidebar.tsx`, `ui/{card,button,tabs,table,input,select}.tsx`.

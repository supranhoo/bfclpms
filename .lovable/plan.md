## Goal

Show a coloured frequency pill next to **every** non-Monthly KPI title on the dashboard / review surfaces — currently only **Daily**, **Bi-Monthly**, and **Quarterly** render. **Weekly**, **Half-Yearly**, and **Yearly** are silently dropped. **Monthly** is intentionally suppressed (the implicit default).

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data / schema | None — pure presentation | — |
| Workflow / scoring | None | — |
| UI consistency | Centralises 4 currently divergent inline JSX blocks into one component | Same visual language everywhere |
| Regression | Low — replacing existing per-frequency JSX with a shared component that emits the identical markup for Daily/Bi-Monthly/Quarterly and adds new variants for Weekly/Half-Yearly/Yearly | Snapshot/unit test for the component |

## Plan

### 1. New shared component
**`src/components/review/FrequencyBadge.tsx`** — single source of truth.

| Frequency  | Label        | Color (light / dark text + border)            | Icon |
|------------|--------------|-----------------------------------------------|------|
| Daily      | Daily        | blue (existing `DailyBadge` palette)          | Calendar |
| Weekly     | Weekly       | sky                                           | CalendarDays |
| Bi-Monthly | Bi-Monthly   | violet (existing)                             | — |
| Quarterly  | Quarterly    | teal (existing)                               | — |
| Half-Yearly| Half-Yearly  | amber                                         | — |
| Yearly     | Yearly       | rose                                          | — |
| Monthly    | *(no badge — returns null)*                                | — |

Same dimensions / typography as the current ad-hoc badges (`text-[10px] px-1.5 py-0 h-4` desktop, `text-[10px] px-1 py-0 h-4` mobile via a `size="sm" | "xs"` prop). All colors via Tailwind semantic palette tokens (border + text classes, no `bg-*` flooding).

### 2. Replace ad-hoc sites
Swap the inline `Bi-Monthly` / `Quarterly` / `DailyBadge` blocks in:
- `src/components/review/KpiDetailsTable.tsx` (team-reviews desktop — the surface in your screenshot)
- `src/components/dashboard/MobileKpiCard.tsx` (own-dashboard mobile)
- `src/components/review/MobileKpiCard.tsx` (team-reviews mobile)
- `src/components/review/KpiHeaderSection.tsx` keeps its existing **cycle-label** chip (e.g. "Bi-Monthly: Sep–Oct 2026") since it carries extra cycle metadata, but I'll add Weekly/Half-Yearly/Yearly cycle labels there too via the existing `getCycleLabel` helper.

`DailyBadge` stays exported but becomes a thin re-export of `<FrequencyBadge frequency="Daily" />` for backwards compatibility (other call sites in `DailyKpiExpandButton` unchanged).

### 3. Test
`src/test/frequencyBadge.test.tsx`:
- Daily / Weekly / Bi-Monthly / Quarterly / Half-Yearly / Yearly each render with the expected label + non-empty className
- Monthly returns `null`
- Unknown frequency returns `null`

### 4. Memory
Append a one-liner to `mem/features/review/kpi-frequency-indicators` noting the new shared `FrequencyBadge` component is the canonical render and lists Monthly as the suppressed default.

## Out of scope
- No backend / logic changes
- No change to KpiHeaderSection's contextual cycle-label chip (just adds the missing frequencies)
- No icon for non-Daily frequencies unless you want one

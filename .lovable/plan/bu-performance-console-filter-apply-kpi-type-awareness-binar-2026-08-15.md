# BU Performance Console — filter apply + KPI type awareness (binary / tiered / numeric)

Two confirmed defects, plus one consistency sweep.

## 1. Filters look like they do nothing

Confirmed in code: `BuConsole.tsx` keeps filter selections in local state and only commits them into the query scope when **Load console** is pressed (`applyScope`). Until then the tree — and therefore the category tab strip and its counts — keeps showing the previously loaded scope. The server RPC (`bu_console_tree`) does filter categories correctly by division / BU / department / manager, so this is purely a UI-commit gap.

Fix:
- Track a "filters changed since last load" state in `ScopeToolbar`. When dirty, the Load button becomes the primary highlighted action and a slim inline hint reads "Filters changed — load console to apply". Results below dim slightly so nobody reads stale counts as current.
- On load, if the currently selected category / KRA no longer exists in the new tree, clear the drill selection instead of silently showing an empty list (today the breadcrumb can point at a category that is gone).
- Show the applied scope as a compact summary line under the tabs (e.g. "DRI · all business units · all departments") so what produced the numbers is visible.

## 2. BU Console treats every KPI as a 0–5 threshold KPI

Confirmed: in the current data for 2026 there are 14,159 numeric, 2,977 binary and 458 tiered KPIs. The console's KPI drawer renders a fixed R0–R5 grid labelled "Scoring scale", and the backend RPCs (`bu_console_tree`, `bu_console_kpi_detail`) never return `uom_type` or `qualitative_options`. So binary and tiered KPIs are shown with six blank threshold boxes, which reads as missing configuration.

Fix:
- Backend: add `uom_type` and `qualitative_options` to the KPI definition payload of `bu_console_kpi_detail`, and to each variant node in `bu_console_tree`. Include `uom_type` in the variant identity so a binary and a numeric definition of the same title are never collapsed into one node.
- UI: replace the hardcoded R0–R5 block in `KpiDetailDrawer` with a shared scoring-scale renderer:
  - numeric → R5…R0 thresholds (unchanged, blanks hidden)
  - binary → the actual Yes/No options with their ratings, read from `qualitative_options` (never assumed Yes=5/No=0 — some safety KPIs are inverted)
  - tiered → each tier label with its rating, sorted high to low
  - no scoring logic configured → an explicit "No scoring logic configured" note instead of empty boxes
- The drawer, tree row and group-write preview all label the KPI type (Numeric / Binary / Tiered) next to the unit, so reviewers see which scoring model applies before acting.
- Group value entry: the dialog currently offers a free numeric input. For binary / tiered KPIs it must offer the KPI's own option list (same control the scorecards use) and convert the label to its rating, matching the existing review behaviour. Mixed-type groups block the write with a clear message rather than writing a raw number.

## 3. Application-wide consistency sweep

The reviewer-facing surfaces (`KpiMetricsSection`, `KpiDetailsTable`, `KpiLogicModal`, the scorecards) already branch on `uom_type` and render qualitative options. The gaps are:
- `RatingScaleDisplay.tsx` — renders R5…R1 only and returns `null` for binary/tiered.
- BU Console (above).

Both will be routed through one shared resolver so there is a single definition of "how is this KPI scored":
- `src/lib/kpiScoringModel.ts` — `resolveKpiScoringModel(kpi)` returns `{ type: 'numeric' | 'binary' | 'tiered' | 'unconfigured', options }`, built on the existing `qualitativeUom` helpers and `kpiHasScoringLogic`.
- `src/components/review/KpiScoringScale.tsx` — one presentational component consuming that model, reused by the console drawer and `RatingScaleDisplay`.

No change to how scores are calculated, stored or approved. Rendering and one dialog input control only.

## Risk & impact
- Data: none. Additive read-only columns in two RPC payloads; no schema change, no writes.
- Workflow: unchanged. Group write gains a guard that refuses ambiguous mixed-type batches — strictly safer than today.
- UI: KPI drawer scoring block, console tab strip hint, `RatingScaleDisplay` gains two new branches.
- Regression risk: low; contained to presentation. Highest-risk item is the group value entry control change, covered by tests.
- Rollback: revert the components and re-deploy the previous RPC bodies; nothing persisted.

## Tests
- `kpiScoringModel.test.ts` — numeric with partial thresholds, binary with inverted Yes=0/No=5, tiered ordering, unconfigured KPI.
- Extend `groupValueEntry.test.ts` — qualitative group writes send the option's rating, mixed-type groups are refused.
- Extend `kpiVariants.test.ts` — variants differing only by `uom_type` stay separate nodes.

## Documentation
- New ADR-271, plus POLICY entry: any surface that displays or influences a score must render the KPI's declared scoring model (numeric thresholds, binary options, tiered options) and must never present a bare 0–5 scale for a qualitative KPI.

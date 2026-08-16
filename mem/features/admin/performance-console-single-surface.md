---
name: Performance Console single surface
description: Console has no tabs — one drilldown tree with Configure/Review modes, stage rail, and dialogs for alignment/library (ADR-289)
type: constraint
---
The Performance Console is ONE surface. Do not add tabs.

- Two modes only: Configure (KPI definition list in the KRA disclosure) and Review
  (`KraWorksheet` — KPI x employee grid for that KRA — in the same disclosure).
- `BuConsoleTree` `renderKraPanel` swaps the panel; never stack a second panel.
- Pipeline = `StageRail` above the tree (counts from `bu_console_pipeline`), also the stage picker
  for the worksheet. Read-only for every tier.
- KRA alignment (`GoalsTab`) and KPI library/duplicates (`MergeProposalsTab`) are header overflow
  dialogs. `PipelineTab.tsx` / `ReviewRunTab.tsx` are deleted; stage labels live in `pipelineStages.ts`.
- Consolidation is presentation-only: RPCs, access/write tiers and §88 immutability unchanged.
POLICY §CONSOLE-SINGLE-SURFACE.

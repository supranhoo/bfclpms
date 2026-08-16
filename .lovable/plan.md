# Per-employee "Tune" must respect the KPI's scoring type (ADR-282)

## What is wrong today

`RowOverrideDialog.tsx` is type-blind. It always renders a free-text **Unit** box, a **Direction** selector and a six-box **R5…R0 scoring ladder**, even for a Yes/No KPI like "Closure of audit observations related to spillage".

For a binary/tiered KPI:
- R0–R5 are not used at all — scoring comes from `qualitative_options`. Filling them writes dead data and makes the KPI look configured when it is not.
- The Unit box shows the literal `binary`; editing it to anything else desynchronises the row from every reviewer surface that branches on `uom_type`.
- Direction (increase/decrease) is meaningless for a Yes/No answer.
- Per-employee divergence of the scoring model is the real hazard: one employee scoring Yes=5 while the group scores No=5 would silently change results and break the group's own aggregation.

This contradicts the parity rule already adopted in ADR-271 (`resolveKpiScoringModel` / `KpiScoringScale`), which the KPI detail modal already follows — the tuning dialog was never routed through it.

## The rule to adopt

The **scoring model of a KPI is group-owned, never per-employee**. Per-employee tuning may change *how much a KPI counts and when it is measured* (weightage, target, frequency, cycle anchor, day counting, source of data) — never *how a value turns into a score* (`uom_type`, `qualitative_options`, R0–R5, direction, threshold mode).

Numeric KPIs keep the ladder tunable per employee, because that is a target-level adjustment, not a change of model.

## Changes

### 1. Type-aware tuning dialog
- Resolve the row's model with `resolveKpiScoringModel({ uom_type, qualitative_options, r0..r5 })`.
- Header gains a type chip: **Value based / Yes-No / Tiered**.
- Numeric: unchanged (ladder + direction, as now).
- Binary / Tiered: the ladder and direction inputs are replaced by a **read-only scoring scale** (`KpiScoringScale`) showing the KPI's real options and their ratings, with the note "Scoring options are group-owned — edit them for all employees from *Edit definition*." A link switches to the group edit dialog.
- Unit becomes read-only for qualitative KPIs (it mirrors the type), editable for numeric.
- If a qualitative KPI has no options configured, show "No scoring logic configured" and point to the group editor instead of six empty boxes.

### 2. Server-side guard (the part that actually protects the data)
A UI-only fix is not enough — the RPC accepts any whitelisted field. Add a validation in `bu_console_validate_changes` (used by both `bu_console_apply_kpi_changes` and the row-override path):
- reject `r0..r5`, `criteria`, `threshold_mode`, `uom` changes when the target KPI's `uom_type` is `binary` or `tiered`;
- reject `qualitative_options` / `uom_type` changes coming from a **row-scope** run entirely (group scope keeps them);
- reject `qualitative_options` payloads that are not a non-empty array of `{label, rating 0..5}` for a qualitative KPI.
Rejections surface as a clear message, and for bulk runs as skipped rows (`scoring_model_locked`) — consistent with the existing `cycle_anchor_conflict` handling, never a mid-run abort.

### 3. Payload
`bu_console_kpi_detail` already returns `uom_type` and `qualitative_options`; add `qualitative_options` to `BuConsoleEmployeeRowExtras` in `useBuConsole.ts` so the dialog can read it. Remove `r0..r5`, `criteria`, `uom` from the row-scope editable set when the KPI is qualitative (client mirror of the server rule).

## Risk & impact
- Data: no schema change; strictly narrows what can be written. Existing rows untouched.
- Workflow: group definition edit remains the single place to change a scoring model — unchanged behaviour for numeric KPIs.
- UI: tuning dialog for binary/tiered KPIs loses 7 inputs and gains a read-only scale; numeric dialog unchanged.
- Regression risk: low, contained to the console. Server guard is additive validation.
- Rollback: revert the component and restore the previous `bu_console_validate_changes` body; nothing persisted.

## Tests
- `rowOverrideModel.test.ts` — editable-field set per type; qualitative rows never emit `r*`/`criteria`/`uom`.
- Extend `groupEditModel.test.ts` — mixed/invalid `qualitative_options` rejected; row-scope model change rejected.
- Snapshot the dialog for a binary KPI: no ladder rendered, read-only scale present.

## Documentation
- **ADR-282 — Scoring model is group-owned; per-employee tuning is scope-only.**
- POLICY §KPI-SCORING-MODEL-GROUP-OWNED, cross-referenced from §KPI-TYPE-PARITY (ADR-271).

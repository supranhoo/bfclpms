# Split the bell curve config dialog into two

Today one dialog, "Configure bell curve targets", holds two unrelated policies: the **target distribution / compliance thresholds** and the **exemption penalty rule**. They are owned by different decisions (ADR-218 vs ADR-222/224) and are edited at different times, so they get separate dialogs.

## What changes for the user

In the Bell Curve Analysis header, the single **Configure targets** button becomes two:

1. **Configure targets** — opens "Configure bell curve targets": the five band targets, the running Total %, Green/Amber thresholds, the cycle-scope checkbox, Save targets. Nothing about exemptions.
2. **Exemption penalty** — opens "Exemption penalty rule": the on/off switch, penalty type (No penalty / Step down N slabs / Exclude top N tiers), the type-specific fields (Slabs to step down, Applies to, How many slabs count as "top", Top tiers excluded), Floor %, the "Effect on each slab" preview, the cycle-scope checkbox, Save rule.

Both buttons stay admin/HR-only (`canConfigure`) exactly as today, and both appear in the report and in the Annual Review Admin Bell Curve tab since they share one component. On mobile the two buttons wrap in the existing `flex-wrap` toolbar.

Saving either dialog writes the same config record; the untouched half is preserved because each dialog edits a full copy of the current config and saves it whole. The cycle-scope checkbox behaves as it does now (unchecked = organisation default, checked = override for the active cycle).

## Technical detail

- New `src/components/reports/annual-review/bellCurve/ExemptionPenaltyDialog.tsx` — moves the exemption block (current `BellCurveConfigDialog.tsx` lines 123-240), its `previewRows` / `penaltyRule` computation, the slab hook and the `applyExemptionPenalty` / `formatSlabPercent` imports out verbatim. Same props shape as the targets dialog (`open`, `onOpenChange`, `config`, `cycleId`, `cycleName`), same `useSaveBellCurveConfig` mutation, same scope-change id-drop logic, toast "Exemption penalty rule saved".
- `BellCurveConfigDialog.tsx` — keeps bands, total, thresholds, scope checkbox, `validateConfig`; drops the exemption UI and its now-unused imports (`Switch`, `Select*`, `useAnnualReviewRatingSlabs`, `ratingSlab` helpers).
- `BellCurveTab.tsx` — add `penaltyOpen` state, a second header button (icon `SlidersHorizontal`), and mount `<ExemptionPenaltyDialog />` next to the existing dialog. Button gated by `canConfigure`, shown in both band modes.
- No engine change: `applyExemptionPenalty`, `effectiveSlabPercent`, banding and exports are untouched. No schema, RPC or RLS change — same `annual_review_bell_curve_config` row and columns.

## Risk

- Data impact: none. Same table, same columns, same save path.
- Regression risk: low — UI relocation only. Watch item: both dialogs must save from a full config copy so one never blanks the other's fields; this is how the current dialog already builds its payload.
- Rollback: re-inline the exemption block and delete the new file/button.

## Docs and guards

- `docs/adr/ADR-222a.md` — exemption penalty rule gets its own dialog; rationale and the "save the whole config" invariant.
- `POLICY.md` §AR-BELL-CURVE: note the two separate configuration surfaces.
- Memory update on `mem://features/reports/bell-curve-analysis`.
- Existing `src/test/annualReview/bellCurve*.test.ts` and the exemption-penalty tests continue to guard the engine; no new engine behaviour is introduced.

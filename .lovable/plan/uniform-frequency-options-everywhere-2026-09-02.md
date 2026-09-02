# Uniform frequency options everywhere

## What is wrong today

In the "Assign New KRA" dialog the Frequency dropdown is written out three separate times — once per KPI type:

- Numeric: all seven options, plus the Cycle Start picker for multi-month cycles.
- Binary (Yes/No): only Daily, Weekly, Monthly, Quarterly, Yearly — Bimonthly and Half-yearly missing, no Cycle Start picker.
- Tiered: same five options, also missing the anchor picker.

Verified in `src/components/admin/AdminKpiCreateDialog.tsx` (numeric list at lines 1015-1021, binary at 1101-1105, tiered at 1151-1155). Other frequency pickers in the app (Admin KPI Editor, Template form, Performance Console group edit and row override) already list all seven.

## What will change

1. One shared source of truth for the option list, and a single reusable Frequency field component that renders it — so no screen can ever ship a short list again.
2. The binary and tiered branches of "Assign New KRA" use that field, gaining Bimonthly and Half-yearly.
3. The Cycle Start (cycle anchor) picker, today only shown in the numeric branch, is shown for binary and tiered too whenever a multi-month frequency is chosen. A multi-month KPI needs its anchor regardless of scoring type; without it the cycle cannot be resolved.
4. The existing pickers elsewhere are pointed at the same shared list (no visible change — they already show all seven).

### UI impact

- Location: "Assign New KRA" dialog → Metrics & Configuration → Frequency, in the Binary and Tiered views only.
- Change: dropdown grows from 5 to 7 entries; a "Cycle Start" select appears directly beneath it when Bimonthly / Quarterly / Half-yearly / Yearly is selected, exactly as it already does for numeric.
- No layout, spacing, or responsiveness change; the new select reuses the existing grid cell pattern.

### Stored labels

The seven values keep their existing stored spelling — `Daily, Weekly, Monthly, Bi-Monthly, Quarterly, Half-Yearly, Yearly`. These strings are the join key used by scoring, rollover, cycle-anchor and reporting logic across the database, so the display text stays as-is rather than being re-spelled to "Bimonthly" / "Half yearly". Say the word if you want the visible labels changed — that would be a display-only mapping, done separately.

## Risk and impact

- Data: none. No schema, RLS or stored-value change.
- Workflow: binary/tiered KPIs can now be created on multi-month cycles. The anchor requirement is already enforced server-side, and the new picker satisfies it.
- Regression: low — additive options plus a de-duplication of four identical literal lists. Behaviour of existing pickers unchanged.
- Rollback: revert the component; nothing written differently.

## Technical notes

- New `FREQUENCY_OPTIONS` export in `src/lib/frequencyCycleOptions.ts` (already home to `MULTI_MONTH_FREQUENCIES`).
- New `src/components/admin/kpi-form/FrequencyField.tsx` rendering the select + conditional cycle-anchor select.
- Consumers updated: `AdminKpiCreateDialog.tsx` (three branches), `AdminKpiEditorForm.tsx`, `TemplateFormDialog.tsx`, `bu-console/GroupDefinitionEditDialog.tsx`, `bu-console/RowOverrideDialog.tsx` — each drops its local literal array.
- Tests: unit test asserting the shared list has exactly the seven canonical values, that every consumer imports it (no local literal arrays remain), and that the anchor field renders for each multi-month frequency under all three KPI types.
- Docs: DOCUMENTATION.md version entry and a POLICY.md clause naming the shared list as the only permitted source of frequency options.

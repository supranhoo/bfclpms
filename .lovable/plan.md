# Save a tiered option set as a reusable template (ADR-339)

Today the "Use template" dropdown in the Tiered Options builder only offers 7 hardcoded presets (`TIERED_TEMPLATES` in `src/lib/qualitativeUom.ts`). Anything an admin builds by hand — e.g. the "≥ 15% Incentive / 10–14.99% / 5–9.99%" ladder in the screenshot — has to be retyped for every KPI.

This adds "Save as template", so saved sets appear in the same dropdown, alongside the built-in presets.

## Assumptions

- Saved templates are organisation-wide (shared by all admins), not private per user.
- Admins can save, rename and deactivate templates; oversight roles (auditor, management, HR PMS) can read them.
- The built-in presets stay; saved templates are listed in a separate "Saved templates" group.

## Storage — reuse what exists

`public.kpi_scoring_scales` already exists and is unused by the app: `name`, `criteria`, `threshold_mode`, `r0..r5`, `qualitative_options JSONB`, `is_active`, `created_by`, timestamps, unique index on the normalised name, RLS (admin write / oversight read) and grants are all in place. No schema change and no new table — we simply start using it for tiered sets (`qualitative_options` populated, `r0..r5` NULL).

Only additive change: a `scale_kind` text column defaulting to `'tiered'` so the same table can later hold numeric ladders without ambiguity, plus an index on `is_active`.

## Behaviour

In `TieredOptionsBuilder`:

1. Header gains a **Save as template** button next to "Use template". Disabled until the current option set passes existing `validateQualitativeOptions`.
2. Clicking it opens a small dialog: template **Name** (required, uniqueness checked against the normalised name), optional **Description**, and a read-only preview of the tiers being saved.
3. If the name already exists, the dialog offers **Overwrite** instead of a duplicate error (admin only), guarded by the standard confirm dialog.
4. The **Use template** dropdown becomes two groups: *Built-in* (existing presets) and *Saved templates* (from the database, active only, alphabetical). Picking either replaces the current tier list exactly as today.
5. Each saved entry in the dropdown has a small delete affordance (soft delete → `is_active = false`) shown only to admins, behind `ConfirmDestructiveDialog`.
6. Non-admins see the dropdown with saved templates but no Save/Delete controls.

Nothing about scoring, payload building or KPI writes changes — templates only seed the in-form option list.

## Technical detail

- `src/services/kpi/tieredTemplateService.ts` — list / create / overwrite / deactivate against `kpi_scoring_scales`; the only place that touches the table.
- `src/hooks/useTieredTemplates.ts` — React Query hook (`['kpi-tiered-templates']`, 5 min stale time) plus mutations that invalidate it; toasts on success/failure.
- `src/components/admin/SaveTieredTemplateDialog.tsx` — the name/description dialog.
- `TieredOptionsBuilder.tsx` — merged dropdown, Save button, delete affordance. Both call sites (`KpiScoringEditor`, and therefore Assign New KRA + Admin KPI Editor) inherit it with no change.
- Migration: `ALTER TABLE public.kpi_scoring_scales ADD COLUMN IF NOT EXISTS scale_kind text NOT NULL DEFAULT 'tiered'` + partial index on `is_active`. Additive and rollback-safe (drop column).
- Backup: `kpi_scoring_scales` is already covered by the automatic `get_backup_table_order()` RPC — no allowlist change, no denylist entry.

## Risk & impact

- **Data**: additive column only; existing rows unaffected. No KPI row is touched.
- **Workflow**: none — no approval, status or scoring path changes.
- **UI/UX**: one extra button in the tiered builder header and a grouped dropdown; layout otherwise unchanged, dialog follows the existing dialog sizing conventions.
- **Regression risk**: low, confined to the tiered builder. Numeric and Yes/No editors are untouched.
- **Scale**: template count is small (tens); a single filtered `select` with a client-side sort, no pagination needed.

## Tests

`src/tests/tieredTemplates.test.ts` (mocked client):
- round-trip: builder options → saved row payload → applied options are identical;
- duplicate name resolves to overwrite of the same row, never a second row;
- invalid option sets (fewer than 2 tiers, blank label, duplicate rating) are rejected before save;
- deactivated templates are excluded from the dropdown list;
- built-in presets still apply unchanged.

## Documentation

ADR-339, `DOCUMENTATION.md` version entry, and `POLICY.md` §KPI-TIERED-TEMPLATE-LIBRARY (templates are shared, admin-managed, soft-deleted, and never retro-apply to KPIs already saved).

## Open question

Should saving a template also be offered for **numeric** R5–R0 ladders (the table supports it)? Kept out of this change unless you want it.

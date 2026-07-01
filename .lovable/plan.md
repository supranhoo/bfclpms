## Problem

The "Updated fields" line on the Review Timeline lists every field submitted by the Admin KPI Editor, even when the value is unchanged. The form posts its full state, so `changed_fields` currently equals "everything on the form".

## Root cause

In `src/hooks/useKpis.ts` → `useAdminUpdateKpi`:

- `oldKpi` selects only 5 columns (`id, kpi_name, kra_name, status, employee_id`), so a real before/after diff isn't possible.
- `changed_fields` is computed as `Object.keys(updates).filter(...)` — the payload's keys, not actually-changed keys.

Result: the audit row's `metadata.changed_fields` is inflated, and `describeChangedFields` (`src/lib/auditLabels.ts`) faithfully renders all of them.

## Fix (surgical, one file)

In `useAdminUpdateKpi`:

1. Change the pre-update fetch to `select('*')` so we have the full old row.
2. After computing `updates`, build `actualChanged` by comparing each key's old vs new value with a deep-equality check (handles scalars, `null`, arrays like `qualitative_options`, and JSON objects). Skip `id` and `reason`.
3. Write `metadata.changed_fields = actualChanged` (fallback to `[]` when nothing changed — `describeChangedFields([])` already returns `""`, and `classifyAdminOverride` already treats empty as `kpi_updated`; the Timeline row simply won't show an "Updated fields:" line).
4. Keep `old_value` shape backward compatible: continue to pass the fetched row (now full) as `old_value` — timeline/PDF consumers already tolerate extra columns.

No changes to:
- `auditLabels.ts` (its `describeChangedFields` already handles fewer / zero fields).
- `KpiTimeline` renderer.
- DB schema, RLS, or existing audit rows (historical rows stay as-is — they are immutable per POLICY §104).

## Risk & impact

- Data: additive — same audit row, more accurate `changed_fields`. Old rows untouched.
- Workflow / UI: Timeline row now shows only truly-changed fields; if nothing changed, no "Updated fields" line appears (matches user expectation).
- Regression: minimal. Deep-equality uses `JSON.stringify` on both sides after normalizing `undefined → null` for parity with the DB row.
- Rollback: revert the single hook change.

## Tests

Add a unit test for the diff helper (extract as `diffKpiUpdates(oldRow, updates)` in the hook file or a small util) covering:
- scalar unchanged / changed
- `null` ↔ `null`, `null` ↔ value
- array equality (`qualitative_options`)
- ignores `id` and `reason`

## Docs

Append a note in `DOCUMENTATION.md` version history and `POLICY.md` §104 clarification: "Admin edit dialog logs only fields whose value actually changed."

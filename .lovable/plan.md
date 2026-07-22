## Current State (verified from src/pages/reports/KpiScorecardDetail.tsx)

The "Pending With (Name)" column is already fully wired end-to-end:

- **Default field registry** (line 53): `pending_with` is a default visible field labelled "Pending With (Name)".
- **Row data** (line 306, 351): each `FlatRow` carries a resolved `pendingWith` computed via `resolvePendingWith(...)` using the workflow chain.
- **UI table** (line 1013–1017): renders `displayPendingWith(r)` with a sortable header and a column filter popover.
- **Single-month export** (`handleExport`, line 554–564): builds headers from `resolvedFields.filter(f => !f.is_hidden)` and maps each row via `toExportRecord` → `ksdValueFor` case `'pending_with'` → `displayPendingWith(r)`.
- **Range export** (`handleRangeExport`, line 618–674): uses the same `visible` fields, the same `toExportRecord`, and applies the same UI filters (company, department, search including Pending With).
- **Terminal states**: `displayPendingWith` returns `"Completed"` for approved rows and `"N/A"` for `is_na` rows; otherwise the resolved reviewer/owner name, falling back to em-dash `—` if unresolved — matching the existing standard used elsewhere in the report.

Row-by-row parity is guaranteed because both the UI grid and the export iterate the same `filtered` array (or per-period equivalent) and both resolve Pending With through the identical `displayPendingWith` helper.

## Plan

No code changes required. I will:

1. Run the existing unit tests (`src/test/kpiPendingWithSummary.test.ts`, `kpiPendingWith.test.ts`) to confirm the resolver + display helpers are green.
2. Spot-check the export path by tracing one `FlatRow` through `ksdValueFor('pending_with', …)` and confirming the header list includes "Pending With (Name)" when the field is not hidden in `report_field_configs`.
3. Confirm no admin has hidden the `pending_with` field for this report; if a workspace has hidden it, document that unhiding it in Report Settings restores the column in both UI and Excel (the field respects the existing show/hide governance — per project rules I will not force-show it).

## Deliverable

A short confirmation with test results and the trace, plus a note on the `is_hidden` governance dependency. If tests fail or the trace reveals a gap, I'll return with a follow-up fix plan before touching code.

## Not Applicable

- Schema / RLS / migrations
- UI restructure (additive column already present)
- New backend calls (uses existing `updated_at` fetch already added)

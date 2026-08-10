# Export Employees from User Management

## Goal
Add an **Export Employees** button to the User Management toolbar (`/admin/users`) that produces the same full Employee Master workbook currently only available at Administration → Import Data → "Export Current Data".

## Assumptions
- Output must match the import template exactly, so a re-upload round-trips (including admin-defined custom Employee Master fields).
- Export covers all employees, independent of the on-screen page/filters (full-master option chosen).
- Admin-only, consistent with the existing Import Data export.

## Risk & Impact Report
- **Data impact:** Read-only. No schema or RLS change.
- **Workflow impact:** None; adds a second entry point to an existing capability.
- **UI/UX:** One extra button in the existing toolbar row next to Columns / Bulk Grant Access; disabled with a spinner while exporting.
- **Regression risk:** Low, but duplicating export code would drift from the import template. Mitigated by extracting the export into a shared module used by both pages.
- **Scalability:** ~2.7k employees. Export fetches in 1000-row batches and hydrates custom field values with batched `in()` queries — no unbounded single query.

## Steps
1. Extract the existing `exportEmployeeData` logic from `ImportData.tsx` into `src/lib/employeeMasterExport.ts` (pure service: batched fetch, column ordering from `employeeMasterColumns.ts` / `employeeMasterFields.ts`, custom-field hydration, XLSX build).
2. Rewire `ImportData.tsx` "Export Current Data" to call the shared service (behaviour unchanged).
3. Add the **Export Employees** button in `UserManagement.tsx` toolbar: `Download` icon, loading state, success/error toast, `aria-label`.
4. Verification: export from both pages, confirm identical headers and row count vs. `profiles`, and confirm the exported file re-imports cleanly with "Allow update existing".

## UI Changes
- Location: `/admin/users`, toolbar row containing Columns and Bulk Grant Access.
- New button "Export Employees" (outline variant, `h-10`), left of Bulk Grant Access.
- While running: spinner + disabled; on finish: toast with row count.
- Mobile: wraps within the existing flex-wrap toolbar; icon-only below `sm` with `sr-only` label.

## Tests
- Unit tests for `employeeMasterExport.ts`: header order matches the import template, custom fields appended, batching covers >1000 rows, empty-dataset case.
- Mock data with active + inactive employees and one custom field.

## Docs & Policy
- DOCUMENTATION.md: new ADR-251 — Employee Master export SSOT (single service, two entry points).
- POLICY.md: §EMP-MASTER-EXPORT-PARITY — export columns must equal import template columns; adding a master field must appear in both automatically.
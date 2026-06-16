# Fix: Bulk workbook downloads only 25 rows instead of all employees

## Root cause

`ProgressTab` in `src/pages/annual-review/AnnualReviewAdmin.tsx` passes the **paginated** `instances` (page size 25) into `<UnifiedBulkDialog instances={...} />`. The dialog uses that same array for both:
1. The Download workbook button → workbook contains only the current page.
2. The Upload preview → any employee outside the current page is reported "Unknown employee".

A correct, RLS- and policy-safe full-fetch already exists: `fetchAllInstancesForExport({ cycleId, status, hasOverride, departmentId, businessUnitId, managerId, search })` in `src/services/annualReview/annualReviewService.ts`. It honors the same filters as the grid and paginates via `fetchAllPaged` (POLICY §94 / §109).

## Risk & impact

- Data: read-only fetch; no schema, RLS, or write-path changes.
- Workflow: bulk apply now operates on the entire filtered set the admin sees, which is the documented intent ("Progress snapshot exports all filtered rows" footer text).
- UI: dialog button label changes from "Download workbook (25 rows)" → "Download workbook (N rows)" where N is the total filtered count. Adds a brief loader while the full set streams in.
- Regression risk: low. The full-fetch helper is already used by the Progress snapshot export, so behavior is proven on the same filter inputs.
- Scalability: cycles run ~2.5k instances today. `fetchAllInstancesForExport` is paged and already used for full exports; same cost profile.

## Plan

1. **`AnnualReviewAdmin.tsx` (ProgressTab)**
   - Add local state `bulkInstances: InstanceWithEmployee[] | null` and `bulkLoading: boolean`.
   - Replace the "Open bulk workbook" trigger's `onClick` to: set loading, call `svc.fetchAllInstancesForExport({ cycleId, status, hasOverride, departmentId, businessUnitId, managerId, search })` with the SAME filter args used by `paginatedArgs`, store result, then open the dialog.
   - Pass `instances={bulkInstances ?? []}` to `<UnifiedBulkDialog>` (only open when array is ready).
   - On dialog close, clear `bulkInstances` so a re-open re-fetches against current filters.
   - Show a small inline spinner / disable the trigger while `bulkLoading`.

2. **`UnifiedBulkDialog.tsx`** — no logic change required; it already renders `instances.length` everywhere. Just trust the larger array. (Optional: tighten the description copy to "covers all filtered employees".)

3. **Docs / Policy**
   - `DOCUMENTATION.md` → Annual Review › Bulk workbook section: note that the download contains every employee matching the current Progress filters, not just the visible page.
   - `POLICY.md` → §94 / §109 reference: add bulk workbook to the list of compliant call sites.
   - `mem/features/annual-review/operations.md` → record the fix (paginated grid + full-fetch on bulk action).

4. **Test**
   - New `src/test/annualReview/bulkWorkbookFullFetch.test.ts` (regression): asserts the page-level Download trigger calls `fetchAllInstancesForExport` (not the paginated hook) and passes the active filter args verbatim. Pattern mirrors `seedInstances.paging.test.ts` — source-grep regression to prevent future reintroduction of the page-only dataset.

## Out of scope

- Changes to upload parsing, apply path, or `bulk_*` RPCs.
- Re-paginating the on-screen grid (stays at 25/page as today).
- Streaming UX (progress bar inside the dialog) — current spinner on the trigger is sufficient given existing fetch times.

## Rollback

Revert the `AnnualReviewAdmin.tsx` and `UnifiedBulkDialog.tsx` diffs and the test file. No schema, migration, or RPC changes to undo.

# BUG-039 Plan — Remaining Export Current Data Timeout

## Confirmed current failure
The previous BUG-038 fix removed the heavy nested KPI join, and KPI pages now succeed. The remaining failure is a different query in the same export flow:

```text
GET /review_submissions?...&order=kpi_id.asc&offset=0&limit=1000
Status 500
message: canceling statement due to statement timeout
```

So the export still fails when fetching `review_submissions`, not while fetching `kpis`.

## Root cause
`review_submissions` has 7,550 rows and its SELECT policies contain role/relationship checks that repeatedly consult `kpis`/`profiles` for each row. Even though the query is ordered by `kpi_id`, asking for all submissions through normal client RLS still exceeds the backend statement timeout on the first page.

The earlier test covered KPI nested joins but did not protect the `review_submissions` page size / RLS-heavy export path.

## Fix approach

### 1. Stop exporting all submissions directly
Change `exportKpiData()` so it does not run a broad paged query on `review_submissions`.

Instead, after the KPI rows are fetched, fetch submissions in small `kpi_id IN (...)` batches:

```ts
for (const batch of chunk(allKpiIds, 100)) {
  await supabase
    .from('review_submissions')
    .select('...needed columns...')
    .in('kpi_id', batch)
    .order('kpi_id');
}
```

This keeps every statement bounded and uses the existing `review_submissions.kpi_id` index.

### 2. Reduce risky page sizes
Use a smaller export-safe page size for KPI and submission-related reads where needed:
- KPI pages: keep 500 or reduce to 250 if testing shows it is safer.
- Submission lookup batches: start with 100 KPI IDs per query.

### 3. Preserve the same Excel output
Keep the current exported columns and rating fallback logic unchanged. Only the data-fetch strategy changes.

### 4. Improve user feedback during export
Update the button/loading text/toast so admins can see progress such as:
- Loading KPI data
- Loading review scores
- Building Excel file

This avoids the impression that the export is frozen.

### 5. Regression coverage
Add BUG-039 tests to `src/test/bugBountyFixes.test.ts` asserting:
- `exportKpiData()` no longer calls `fetchAllPaged` over `review_submissions`.
- `review_submissions` is fetched by `.in('kpi_id', batch)`.
- batch size is capped, to avoid reintroducing a large RLS-heavy query.

### 6. Policy, documentation, and memory sync
Update:
- `POLICY.md` with a new rule extending large-export policy: RLS-heavy child tables like `review_submissions` must be fetched by parent-ID batches, not broad table scans.
- `DOCUMENTATION.md` version history with BUG-039.
- `mem/architecture/database/large-export-pagination-policy` to include the `review_submissions` exception.

## Risk & Impact Report

- **Data Impact:** Read-only; no schema/data changes required.
- **Workflow Impact:** No permission changes; export remains admin-facing and keeps the same file format.
- **UI/UX Impact:** Minimal; same button and Excel output, with clearer progress feedback.
- **Regression Risk:** Low-to-medium. The main risk is missing submissions if batching is implemented incorrectly.
- **Mitigation:** Use deterministic KPI-ID batching, map by `kpi_id`, and add regression tests to prevent broad `review_submissions` scans from returning.

## Files to edit after approval
- `src/pages/admin/ImportData.tsx`
- `src/test/bugBountyFixes.test.ts`
- `POLICY.md`
- `DOCUMENTATION.md`
- `mem/architecture/database/large-export-pagination-policy`

# Excel download for the Recommendations queue

## What you get
In the Recommendations tab, the single "Export page" button becomes an **Export** dropdown with three choices:

- **Current page (Excel)** — the 25 rows on screen, as `.xlsx`
- **All filtered rows (Excel)** — every row matching the active Status / Type / Monetary / Source / Search filters (all 1,375 today), as `.xlsx`
- **Current page (CSV)** — unchanged, so existing habits keep working

The full export fetches pages of 500 rows behind the scenes with a progress toast ("Fetched 1,000 of 1,375…") and a hard cap of 50,000 rows; if the cap is hit the toast says so and the file is still delivered. Errors surface as a toast, never as a silent empty file.

Column order and headers stay exactly the same as today's CSV, plus a trailing note row recording the filters used and the export timestamp.

## Technical notes
- New SSOT module `src/lib/annualReview/recommendationExport.ts`:
  - `RECOMMENDATION_EXPORT_COLUMNS` (locked order, mirrors the current CSV header)
  - `buildRecommendationRows(rows)` — pure mapper reusing `formatRecommendationAmount` and `RECOMMENDATION_STATUS_LABEL`
  - `buildRecommendationWorkbook(rows, filterNote)` → `XLSX.WorkBook`
  - `downloadRecommendationExcel(...)`
- Uses the existing `xlsx` (SheetJS) dependency — no new packages, consistent with `safetyIncidentExcelExport.ts`.
- Full export reuses `fetchRecommendationQueue` with `pageSize: 500` looping on `total`, so RLS, filters and the `ar_recommendation_queue` RPC stay the single data path (no new RPC, no schema change).
- `RecommendationsTab.tsx` gains the DropdownMenu + an `isExporting` state that disables the trigger; no business logic moves into the component.

## Risk & impact
- Data: read-only, no schema or RLS change.
- Workflow: additive; CSV path preserved.
- Regression: low — export logic is isolated in a new pure module.
- Scale: paginated at 500/batch with a 50k cap, so the browser never loads an unbounded set.
- Rollback: delete the new module and restore the single CSV button.

## Tests
`src/test/annualReview/recommendationExcelExport.test.ts` — locked column order, amount/status formatting, legacy vs form source label, empty-row handling, and the filter note row.

## Docs
DOCUMENTATION.md (ADR-226 section) and POLICY.md §AR-RECOMMENDATION-TRACKING gain the export rule (locked columns, 50k cap, filters honoured).
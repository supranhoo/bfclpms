## Problem (RCA)

In `src/services/annualReview/cycleBulkDataUpload.ts` → `parseAndDryRun`, whenever ONE system-KPI cell in a row can't be processed, the entire row is marked `error`, `rowChanges` is cleared, and the loop `break`s. Two triggers cause this:

1. **Non-numeric value** in a system-score column (line 417–422).
2. **Library-unlinked KPI slot** — no `scoring_rules.bands` on a non-manual slot, e.g. LTI/STI when the template slot isn't mapped to the KPI Library (line 432–443).

Effect: an employee whose row contains an unmapped LTI/STI column loses ALL their other valid updates (5S, Trainings, Production, Eligibility fields, etc.). That matches the report — only 8–12 rows (the ones without an LTI/STI value in the sheet) update; the rest error out and nothing on them is written.

Expectation: unmappable / invalid single cells should be **skipped at the cell level**, while every other valid cell in the same row is still applied. Row-level errors (employee not in cycle, locked stage) continue to fail the whole row.

## Fix

Change `parseAndDryRun` from row-fatal to cell-skip for the two cell-level issues:

- Non-numeric system-score cell → skip that cell only; collect a per-cell warning.
- Non-manual system-score cell with no library bands → skip that cell only; collect a per-cell warning ("Column X not linked to KPI Library — cell skipped").
- Continue evaluating remaining columns for the row. If any cell change is valid, verdict = `apply`; the row also carries a `warnings: string[]` list surfaced in the dry-run UI.
- Only when EVERY cell in the row is skipped/warned and no valid change exists does the row fall through to a `skip` verdict with the aggregated reason.

`commitDryRun` already iterates over `row.changes` only, so partial rows commit correctly with no further edits.

Dialog UI (`SystemScoresBulkUploadDialog` or the current dry-run table) renders the per-row `warnings` as an amber sub-line under the row, so HR can see WHICH columns were skipped and WHY, without blocking the good columns.

Health strip (`unresolvedSlots`) is retained but no longer blocks commit — it becomes advisory.

## Risk & Impact

- **Data**: additive only. Never writes to skipped cells; existing values preserved. Stage guard (`STAGE_SAFE`) unchanged.
- **Workflow**: no permission/RLS change.
- **UI**: dry-run table gains a per-row warnings line; error/apply/skip counters recomputed to reflect cell-level skips.
- **Regression**: low. `commitDryRun` unchanged. Legacy scorer branch still blocked at cell level, so lower-is-better inversion (LTI=0 → 0) cannot happen — the offending cell is dropped, not silently scored.
- **Backup / retention / RLS**: unaffected.

## Files to change

1. `src/services/annualReview/cycleBulkDataUpload.ts`
   - `DryRunRow` gains `warnings?: string[]`.
   - Replace both fatal branches with cell-skip + warning push.
   - Recompute counters: a row with ≥1 valid change = `apply` (even if some cells warned); a row with 0 valid changes and ≥1 warning = `skip` with combined reason; hard row errors (employee/stage) unchanged.
2. Dry-run dialog component that renders the report — add warnings sub-line.
3. `src/test/annualReview/` — new test `cycleBulkDataUploadPartialApply.test.ts` locking:
   - Row with valid 5S + unmapped LTI applies 5S, warns on LTI, verdict `apply`.
   - Row with only unmapped LTI → verdict `skip` with warning reason.
   - Non-numeric single cell → skipped, other cells still apply.
   - Locked stage / unknown employee still row-fatal.
4. `DOCUMENTATION.md` — v2.66.95 entry: bulk upload switches from row-fatal to cell-skip for unmappable / non-numeric system-KPI cells.
5. `POLICY.md` — extend `§AR-SYSTEM-KPI-LIBRARY-LINK` and `§AR-SYSTEM-KPI-RAW-INPUT`: unlinked/invalid cells are skipped with a visible warning; other cells in the same row must still apply.

## Rollback

Pure logic change in one service + one dialog. Revert the two files to restore row-fatal behavior. No schema, no data migration.

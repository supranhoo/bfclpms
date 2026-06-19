
## Problem (RCA)

`IncentiveDataExport.exportDailyData` in `src/components/incentive/IncentiveDataExport.tsx` has three defects that together produce the screenshot (all `—` placeholders, only Rate/Ton populated, rows truncated):

1. **1,000-row PostgREST cap on every read.** `incentive_production_rates`, `production_daily_entries`, and `profiles` are all fetched with unranged `.select(...)`. Metal Sizing has 2,560 mappings and 2,412 June entries — everything past row 1,000 is silently dropped.
2. **Wrong roster source.** `allEmpIds` is built from `rates` (only `rate_type='employee'`) + `entries`. Metal Sizing uses a `common` rate, so `empIds` from rates is empty; the export only sees employees who already have a saved daily entry, and even then only the first 1,000. The on-screen grid sources its roster from `incentive_program_mappings` (via `fetchProgramMappingsPaged` + `useIncentiveEligibility`), so the Excel does not match the grid.
3. **Profile lookup misses → dashes.** Because `profiles` is also capped at 1,000 and the `.in('id', empIds)` list itself can exceed URL limits for 2,500+ ids, most rows resolve `profileMap.get(empId) === undefined` and render `—` for Employee / Code / Designation / Department.

The vessel and target exporters have the same 1k-cap risk but are not in the reported screenshot; we'll fix `daily` (the reported one) and harden `vessel`/`target` defensively since they're a one-line change.

## Risk & Impact Report

- **Data Impact:** Read-only. No schema, RLS, or write paths touched.
- **Workflow Impact:** None. Export button behavior unchanged; output becomes correct and complete.
- **UI/UX Impact:** None visually. File contents change (full roster, populated employee columns, all days, correct totals).
- **Regression Risk:** Low. Isolated to `IncentiveDataExport.tsx`. Reuses already-vetted helpers (`fetchProgramMappingsPaged`, `fetchAllPaged`, `useIncentiveEligibility` resolution path) that the grid uses, guaranteeing parity.
- **Scalability:** Paged reads at 1k chunks + chunked `.in(...)` profile fetches (batches of 500 ids) keep memory bounded and avoid URL-length errors at 5k+ employees.
- **Mitigation:** Unit tests for the new pure helpers; manual verification by exporting Metal Sizing June 2026 and confirming row count == grid row count (2,560) and June total matches the grid's `filteredGrandTotal`.

## Plan

### Step 1 — New pure helper: `src/lib/incentiveExportData.ts`
- `resolveDailyExportRoster(programId, month, year)` returns `{ employees, rates, entries, daysInMonth }`.
- Roster comes from the **same resolution path as the grid**: program mappings (paged) → eligibility resolution → final employee list. This guarantees Configuration ↔ Data Entry ↔ Export parity.
- Reads use `fetchAllPaged` for `incentive_production_rates` and `production_daily_entries`.
- Profile fetch batched via `chunk(ids, 500)` then `.in('id', batch)` with paged read inside each batch.

### Step 2 — Refactor `IncentiveDataExport.tsx`
- `exportDailyData` becomes a thin wrapper that calls `resolveDailyExportRoster` and maps rows to the existing column shape (Employee / Code / Designation / Department / Rate/Ton / Day 1…N / Total / Amount). Column order and headers unchanged.
- `exportVesselData`: swap raw `.select` for `fetchAllPaged` on `incentive_vessel_rates` and `vessel_monthly_entries`; source roster from program mappings for parity. (Same pattern, smaller scope.)
- `exportTargetData`: paged read on `production_targets` (defensive; usually small).

### Step 3 — Tests: `src/test/incentiveExportData.test.ts`
- Roster equals grid roster when mappings > 1,000.
- Common-rate program: every employee gets `commonRate`, not 0.
- Employee-rate override wins over common.
- Entry values map to correct Day columns; Total = sum of daily values; Amount = Total × rate.
- Profile batching: 2,600-id input produces a single deduped `profileMap` covering all ids.

### Step 4 — Docs & policy
- `DOCUMENTATION.md`: new entry "v2.66.45 — Incentive Excel export pagination & roster parity" describing the three RCAs and the fix.
- `POLICY.md`: extend the existing Incentive Mapping Paging policy to cover **exports** — "All Excel/CSV exports for incentive programs MUST source roster from `fetchProgramMappingsPaged` (or the eligibility resolver) and use `fetchAllPaged` for every related read. Direct `.select(...)` on `incentive_production_rates`, `production_daily_entries`, `incentive_vessel_rates`, `vessel_monthly_entries`, `production_targets` is forbidden in export code paths."

### Step 5 — Verification
- Manual: export Metal Sizing → June 2026; confirm 2,560 rows, all employee columns populated, total matches grid.
- `vitest run incentiveExportData` green.

## Files

- **Add:** `src/lib/incentiveExportData.ts`, `src/test/incentiveExportData.test.ts`
- **Edit:** `src/components/incentive/IncentiveDataExport.tsx`, `DOCUMENTATION.md`, `POLICY.md`

## Out of scope

- UI changes to the export button or dialog.
- Server-side export (would require an edge function; not justified at current volumes).
- Backfill/repair — no data was lost, only the export read truncated.

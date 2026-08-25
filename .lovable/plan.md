# Ledger: enter history for a bi-monthly KPI (Jul-25 → Jun-26)

## What is wrong today

Verified in code and against the database:

- `LedgerRowDialog` has **no month/year field**. Every new row is stamped with the console header's month/year (`period`, `year` props), so history can only be entered by flipping the header month 12 times.
- Worse, the **edit path re-stamps the row**: saving an existing Jul-25 row while the header says Aug-26 writes `review_period = August / 2026`, silently moving the row. That is why corrections to historical months appear to "not update".
- **CSV import ignores month columns** — `importCsv` hardcodes `reviewPeriod: period, reviewYear: year` for every imported line, so an uploaded 12-month sheet collapses into one month.
- The server RPC `org_kpi_dataset_row_save` accepts **any** period/year and has no lock — so nothing on the backend blocks history. The gap is entirely in the entry UI.

## What we will build

### 1. Period is part of the row (fix the core bug)
- Add **Month + Year** selectors at the top of the Add/Edit row dialog, defaulting to the console header on create and to **the row's own period on edit**.
- Save uses the selected period, never the header. Editing a Jul-25 row keeps it in Jul-25.
- Fiscal guard: the year list and the anchor hint come from the existing `fiscalWindow` helpers, so Jan–Jun rows carry the correct calendar year for the Jul–Jun cycle.

### 2. Bi-monthly rhythm made explicit
- For multi-month KPIs the dialog shows the cycle banner from `buildCycleScopeLabel()` — e.g. "Sep-25 is the review anchor; covers Aug–Sep 2025" — so the officer knows which month carries Target/Achieved and which months stay blank.
- Rows on non-anchor months are still allowed (legacy data) but flagged with a soft note.

### 3. Twelve months in one go — "Enter history" grid
- New **Enter history** action next to *Add row*, opening a grid with one line per month of the selected fiscal year (Jul → Jun), pre-filled with existing rows.
- Columns are generated from the KPI's own column design (Target, Achieved, Pro Ach %, Prod Incentive %, Rating for this KPI) — nothing KPI-specific in code.
- Paste-from-Excel supported: paste the sheet block straight into the grid.
- **Preview first**: shows "n new, n updated, n unchanged" before anything is written; commit goes through the existing bulk-import RPC in dry-run → apply order, one reason string recorded per run.

### 4. CSV import honours Month/Year
- `importCsv` reads `Month`/`Period` and `Year` headers when present (accepting `Jul-25`, `July 2025`, `July`+`2025`) and falls back to the header month only when absent. Rows outside the selected fiscal cycle are reported as errors in the preview instead of being silently re-stamped.

### 5. What August will look like
Once August closes you switch the header to **Aug 2026** (or just pick it in the dialog) and fill the Jul–Aug anchor line; the fiscal view then shows the full Jul–Jun ladder with the Total row and roll-up recalculated, exactly like the Excel you shared.

## Technical notes

- Files: `src/components/admin/bu-console/LedgerRowDialog.tsx` (period fields, edit-preserves-period), new `LedgerHistoryDialog.tsx` (12-month grid + paste + preview), `KpiLedgerPanel.tsx` (new action, CSV month parsing), `src/lib/review/kpiLedgerModel.ts` (period parsing + history-diff helpers).
- No schema change and no new RPC: writes reuse `org_kpi_dataset_row_save` and `org_kpi_dataset_bulk_import` (already dry-run capable). Authorisation stays server-side (`can_write_kpi_dataset`).
- Fiscal correctness via `@/lib/fiscalWindow` helpers only (POLICY §90b); cycle labels via `buildCycleScopeLabel` (POLICY §54).
- Validation state: writing into a validated period keeps the existing "Validation stale" behaviour — no bypass added.

## Risk & impact

- **Data**: additive only; the edit-restamp fix stops an existing silent data-move. No historical rows are rewritten by the change itself.
- **Workflow**: unchanged approval/validation ladder.
- **Regression**: bulk paste is preview-first and capped at one fiscal year (12 rows), so no fan-out risk.
- **Rollback**: pure frontend — revert the components.

## Tests & docs

- Unit tests: month/year parsing (`Jul-25`, `July 2025`), edit preserves original period, history-grid diff (new / updated / unchanged), CSV rows outside the fiscal cycle rejected.
- ADR-318 + POLICY §KPI-LEDGER-PERIOD-OWNERSHIP ("a ledger row owns its period; the console header only seeds defaults"), DOCUMENTATION.md version history entry.

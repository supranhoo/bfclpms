---
name: KPI Ledger Period Ownership
description: Performance Console data-table rows own their (review_period, review_year); header is a default only, plus the fiscal history grid and CSV date columns (ADR-318)
type: feature
---

Performance Console KPI data-table (ledger) rows carry their own
`(review_period, review_year)`.

**Rules**
- The console header month/year seeds the default for a **new** row only. It
  MUST NEVER be written onto an existing row on edit — that silently relocated
  historical data and read to users as "unable to update".
- `LedgerRowDialog` exposes Month + Year selectors; on edit it loads the row's
  stored period.
- `LedgerHistoryDialog` renders twelve fiscal slots (Jul→Jun) from
  `fiscalMonthSlots(fiscalStartYear)`, diffs against existing rows with
  `diffHistoryGrid`, and commits through the audited bulk-import RPC after a
  dry run. Blank months are classified `empty` and never written.
- CSV import parses per-line `Month`/`Period` and `Year` headers with
  `parsePeriodToken` (`Jul-25`, `July 2025`, `2025-07`, `07/2025`); the console
  header is only a fallback.
- Multi-month KPIs must show cycle months + anchor month via
  `buildCycleScopeLabel` (see `mem://features/admin/multi-month-kpi-cycle-ux`).
  Non-anchor months are shaded and labelled, not blocked — legacy sheets carry
  them.
- Cycle reads pair period with year via `isFiscalTuple`
  (`mem://architecture/pms/fiscal-window-guard`).

`org_kpi_dataset_row_save` imposes no period lock or anchor constraint — any
period restriction is a UI decision and must be justified.

Helpers: `src/lib/review/kpiLedgerModel.ts`.
Tests: `src/lib/review/__tests__/ledgerPeriodOwnership.test.ts`.
Policy: POLICY §KPI-LEDGER-PERIOD-OWNERSHIP / ADR-318.

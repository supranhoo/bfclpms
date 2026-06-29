## Issue
Excel export of Incentive Data Entry shows ₹3,98,139, but the PMS Data Entry Grand Total shows ₹3,98,134 — a ₹5 discrepancy for the same program/month/employees.

## Root cause (RCA)
Two different rounding strategies for the same total:

- **Grid (SSOT)** — `ProductionDailyGrid.tsx:295` sums first, rounds once:
  `Math.round(Σ (total_e × rate_e))` → ₹3,98,134
- **Excel export** — `IncentiveDataExport.tsx:194` rounds every row, then Excel `SUM` aggregates the already-rounded values:
  `Σ Math.round(total_e × rate_e)` → ₹3,98,139

Across 280 employees the per-row `Math.round` half-up bias accumulates to ~₹5. Both numbers are arithmetically defensible, but the grid is the SSOT the Incentive Report also uses, so the export must match the grid — not the other way around.

This is the same class of defect as ADR-094 (grid vs report parity) — display layer doing its own math instead of mirroring the SSOT.

## Risk & Impact
- **Data:** None — daily values, rates and the underlying compute are unchanged.
- **Workflow:** None — payroll already uses the PMS Grand Total / Incentive Report, not the spreadsheet SUM.
- **UI/UX:** Excel sheet gains one extra row ("Grand Total") at the bottom mirroring the grid; no PMS UI changes.
- **Regression:** Low. Change is confined to `exportDailyData` in `IncentiveDataExport.tsx`.
- **Scalability:** O(N) sum once at export time — negligible.

## Fix (surgical)
`src/components/incentive/IncentiveDataExport.tsx` — `exportDailyData`:

1. Stop pre-rounding per row. Write `Amount (₹)` as the raw `total * rate` (number). Excel cell formatting still renders it as an integer for the user but preserves precision for `SUM`.
2. Append one trailing row `{ Employee: 'Grand Total', Total: Σtotal, 'Amount (₹)': Math.round(Σ(total*rate)) }` computed with the **exact same expression** the grid uses (`filteredGrandTotal` formula). This guarantees the spreadsheet's bottom line equals the PMS Grand Total regardless of how the user re-sums the column.

No changes to:
- `incentiveExportData.ts` (resolver SSOT is correct)
- `ProductionDailyGrid.tsx` (SSOT)
- Edge function / DB / RLS
- Incentive Report

## Tests
Extend `src/test/incentiveExportData.test.ts` with one case:

- **`exportDailyData totals match grid SSOT (sum-then-round)`** — feeds 3 mock employees with rates that produce fractional amounts (e.g. 12.4, 7.6, 0.5) and asserts:
  - The exported `Amount (₹)` column contains unrounded numbers.
  - The trailing Grand Total row equals `Math.round(Σ total × rate)`, matching the grid formula at `ProductionDailyGrid.tsx:295`.
  - Sum of rounded per-row amounts would have differed — proving the regression is guarded.

## Docs & policy
- **ADR-095** (`docs/adr/ADR-095.md`) — "Excel export must mirror grid SSOT for grand totals (sum-then-round, not round-then-sum)."
- **POLICY.md** — append §INC-EXPORT-PARITY: any export of grid-backed money must reuse the grid's sum-then-round formula and append a Grand Total row computed that way.
- **DOCUMENTATION.md** — v2.66.62 release note.
- **mem/features/incentive/** — new memory `export-grid-parity.md` referencing ADR-095, linked from `mem/index.md`.

## Rollback
Revert the single component file; documentation is additive.

## Out of scope
- Changing the grid's rounding strategy.
- Touching the Incentive Report (already paginated and aligned with the grid per ADR-094).
- Re-running compute — totals are unaffected.

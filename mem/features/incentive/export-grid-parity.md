---
name: Incentive export ↔ grid grand-total parity (ADR-095)
description: Excel/CSV exports of incentive amounts MUST write raw per-row total*rate (no Math.round) and append a Grand Total row using Math.round(Σ total*rate) — mirrors the grid SSOT in ProductionDailyGrid.tsx:295. Per-row rounding accumulates half-up bias and diverges from the PMS Grand Total.
type: feature
---

`src/components/incentive/IncentiveDataExport.tsx → exportDailyData`
is the only sanctioned export path. It MUST:

1. Write each row's `Amount (₹)` as the raw product `total * rate`
   (number, unrounded). Excel cell format renders it as integer rupees.
2. Append a trailing `Grand Total` row with
   `Amount (₹) = Math.round(Σ total * rate)` — the exact expression
   used by `filteredGrandTotal` in `ProductionDailyGrid.tsx:295`.

Per-row `Math.round` is FORBIDDEN: with 280 rows of fractional
products the half-up bias accumulated to ₹5 (Upendra, Metal Sizing
June 2026 — RCA ADR-095). Same defect class as ADR-094 (display layer
re-implementing math instead of mirroring the SSOT).

Contract pinned by `src/test/incentiveExportData.test.ts`. Any new
grid-backed export (production targets, vessel monthly, etc.) MUST
follow the same pattern per POLICY §INC-EXPORT-PARITY.
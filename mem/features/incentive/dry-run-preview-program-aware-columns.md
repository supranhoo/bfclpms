---
name: Incentive Dry-Run Preview — programme-aware columns
description: IncentiveDryRunDialog renders tons/rate for production programmes and PMS Score/Base/Final % only for support/vessel; production rows carry pms_score=null by design (ADR-093).
type: feature
---

The Incentive Computation Preview (`src/components/incentive/IncentiveDryRunDialog.tsx`)
selects its column layout from `result.diagnostics.detected_program_type`:

- `production` → Employee, Period, Production (tons), Rate (₹/ton derived
  as `incentive_amount ÷ production_value`, "—" when production is 0),
  DQ Reason, LTI Penalty, Pro-rata, Amount (₹). Includes the footnote
  "PMS Score and Base/Final % do not apply to production-based programmes."
- `support` / `vessel` → legacy PMS-centric layout (PMS Score, Base %,
  DQ, LTI, Pro-rata, Final %, Amount). Gated on `pms_score != null`.

Reason: `compute-monthly-incentives` writes `pms_score: null` for every
production row (see edge fn `index.ts:708`). Rendering the PMS layout for
those rows produced a wall of *N/A* and misled Upendra (2026-06-29).

Do **not** add PMS-derived columns back to the production layout, and do
**not** remove the footnote — both are part of the presentation contract
pinned by `src/test/incentiveDryRunDialogProductionColumns.test.tsx`.
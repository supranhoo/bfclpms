## Issue (Upendra)

In **Incentive Computation Preview** for Metal Sizing (production-based programme), every row shows **N/A** in PMS Score, Base %, DQ, LTI Penalty, Pro-rata and Final % columns — even though the right-most **Amount** column renders correctly and the **Total Amount = ₹68,687** tile is right.

## Root Cause (UI only — no compute bug)

`compute-monthly-incentives` deliberately writes `pms_score: null` for production-programme records (Metal Sizing is `program_type = 'production'`, see `index.ts:708`). Incentive there is `tons × rate`, not a PMS-driven percentage — PMS / Base % / Final % do not apply.

`IncentiveDryRunDialog.tsx` renders the same PMS-centric table for every programme type, gating Base %, Final % and PMS Score on `hasPms = r.pms_score != null`. For every production row that gate fails → the user sees a wall of *N/A* and reasonably concludes the report is broken.

This is purely a **presentation defect** — stored records, totals, status, and amounts are correct. Edge function and DB are unchanged.

## Fix (UI only, scoped to one component)

Make the preview table programme-type aware via `result.diagnostics?.detected_program_type`:

- **Production programme** → swap the PMS-centric columns for production-relevant ones:
  - `Employee | Period | Production (tons) | Rate (₹/ton) | DQ Reason | LTI Penalty | Pro-rata | Amount (₹)`
  - `Rate (₹/ton)` is derived per row as `incentive_amount / production_value` when both are > 0, else `—` (no new fields, no new fetch).
  - Add a small footnote: *"PMS Score and Base/Final % do not apply to production-based programmes."*
- **Support / vessel programme** → keep the existing PMS-centric layout exactly as today (no regression for those flows).
- Tooltip on the PMS Score header is updated to clarify the production-vs-support distinction.

No changes to:
- `compute-monthly-incentives` edge function
- `employee_incentive_records` schema
- Totals / tiles / Confirm & Compute flow
- Vessel / support presentation

## Risk & Impact

- **Data:** none — read-only display change.
- **Workflow:** none — Confirm & Compute payload, RLS, audit unchanged.
- **UI:** only the dry-run preview table for production programmes. Support and vessel previews untouched.
- **Regression risk:** low — gated on `detected_program_type === 'production'`; fallback path is the current renderer verbatim.
- **Scalability:** identical row count, no extra queries.

## Tests (Vitest)

Add `src/test/incentiveDryRunDialogProductionColumns.test.tsx`:

1. Production diagnostics + `pms_score: null` + `production_value`/`incentive_amount` set → renders **Production (tons)**, **Rate (₹/ton)** and **Amount** populated; no *N/A* cells in those columns; footnote visible.
2. Support diagnostics → legacy PMS-centric layout still rendered (regression guard).
3. Production row with `production_value = 0` → `Rate` shows `—` (no divide-by-zero).

## Docs & policy

- `DOCUMENTATION.md` → add note under Incentive Preview: production previews use tons/rate columns; PMS columns are support-only.
- `POLICY.md` → reaffirm "PMS score is not applicable to production-based programmes; preview UI MUST NOT render PMS gating cells as primary signal for these programmes."
- New ADR `docs/adr/ADR-093.md` capturing the RCA + presentation contract.
- `mem/features/incentive/dry-run-preview-program-aware-columns.md` + index entry.

## Files touched

- `src/components/incentive/IncentiveDryRunDialog.tsx` (presentation only)
- `src/test/incentiveDryRunDialogProductionColumns.test.tsx` (new)
- `docs/adr/ADR-093.md` (new)
- `mem/features/incentive/dry-run-preview-program-aware-columns.md` (new) + `mem/index.md`
- `DOCUMENTATION.md`, `POLICY.md`

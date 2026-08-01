# Exemption-aware band placement in the Bell Curve

## Problem

After an exemption is processed the employee's **increment percentage** is penalised
(ADR-222 / ADR-224), and an ineligible employee shows 0%. But the Bell Curve still places
everyone by their **raw rating**: `makeBanding(...).keyOf(rating)` resolves the slab straight
from `total_score / 20` and never consults `effectiveSlabPercent`. So a penalised employee
keeps sitting in the 20% column of the heat map while their report row says 12%.

## What changes

One new placement rule, applied everywhere the distribution is built:

1. Compute the actual rating (ADR-212 / ADR-220 calibration) — unchanged.
2. Compute the raw slab % from that rating, then the **effective** slab % via
   `effectiveSlabPercent(raw, eligibility_status, capOptions)` — the existing SSOT
   (ineligible -> 0%, exempted -> penalty rule applied).
3. If the effective % differs from the raw %, the employee is placed in the band that
   owns the effective % :
   - **Slab % mode** — the slab band whose `increment_percent` equals the effective %.
   - **Rating bands (1-5) mode** — the rating band covering that slab's rating range
     (e.g. 12% -> 3.50-3.99 -> band 4). Confirmed: re-band in both dashboards.
   - Ineligible employees land in the 0% slab / its matching lowest rating band.
4. The employee's actual rating is still shown as their rating everywhere (drill-down,
   "Rating (/5)" column, average rating KPI). Only their **position** moves.

Everything downstream inherits this automatically because they all go through the same
banding: bell curve chart, distribution bar chart, variance table, heat map, group
compliance table, heat-map cell drill-down list, and the Excel/PDF exports.

## Visibility

- Drill-down rows and the heat map keep the existing "Capped" badge; a moved employee also
  shows their original band in the row subtitle, so nothing is hidden.
- Exports get two explicit columns: `Rating Band (actual)` and `Band (effective)`, alongside
  the existing `Slab %` (already effective) and `Exemption Cap Applied`. Counts in the
  distribution / variance / group sheets are the effective ones, matching the screen.
- The header note states the active penalty rule, as today.

## Technical notes

- `src/lib/annualReview/bellCurve.ts`
  - New `PlacementOptions = { slabs, cap: SlabCapOptions }` and
    `placementRatingOf(row, opts)`: actual rating -> raw % -> effective % -> representative
    rating clamped into the effective slab's `[rating_from, rating_to)` window.
  - `Banding` gains `keyOfRow(row)` (placement-aware); `keyOf(rating)` stays for legacy
    callers and pure-rating uses. `makeBanding(mode, config, slabs, placement?)` takes the
    cap options; with no placement argument behaviour is byte-identical to today.
  - `computeBands`, `groupBands`, `heatmapBands`, `summarize`, `employeesInBand` switch to
    `keyOfRow`. `averageRating` keeps using the actual rating.
- `BellCurveTab.tsx` already builds `capOptions`; pass it into `makeBanding` and into the
  export calls (PDF export needs the extra argument).
- `bellCurve/BandEmployeeList.tsx` — original-band subtitle for moved rows, plus the same
  column in its CSV.
- `bellCurve/bellCurveExport.ts` — actual vs effective band columns.
- No schema, RPC or RLS change. Presentation-layer only, fully reversible by dropping the
  placement argument.

## Tests and smoke check

- `src/test/annualReview/bellCurve.test.ts`: penalised exempted employee counts in the lower
  slab band and in the re-mapped rating band; ineligible lands in 0%; band counts still sum
  to the rated denominator; `capEnabled: false` and `mode: 'none'` reproduce today's output.
- Existing `effectiveEligibility.test.ts` / `bulkExemption.test.ts` must stay green.
- Smoke test: run the annual-review vitest suite, then drive the Bell Curve tab in the
  preview (rating mode, slab mode, heat-map cell drill-down, calibrate dialog open, exemption
  dialog open, Excel + PDF export) and report console/network errors.

## Docs

- `docs/adr/ADR-228.md` (exemption-aware band placement), POLICY
  §AR-ELIGIBILITY-EXEMPTION addendum, DOCUMENTATION.md version history, and a memory update
  to `mem/features/reports/bell-curve-analysis.md`.

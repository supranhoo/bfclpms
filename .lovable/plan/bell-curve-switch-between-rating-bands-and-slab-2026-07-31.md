# Bell Curve — switch between Rating bands and Slab %

## What you get

A **Band mode** toggle at the top of the Bell Curve Analysis tab:

- **Rating bands** (current): Unsatisfactory (1) → Outstanding (5), with targets, variance and compliance.
- **Slab %**: the same employees grouped by their increment slab (0%, 4%, 6%, 8%, 12%, 16%, 20%) taken from the admin-maintained slab master (ADR-212), so slab edits flow through automatically.

The toggle applies to the whole tab: KPI cards, bell curve chart, distribution bar chart, variance table, heat map, group compliance table, and both the tab's Excel and PDF exports.

## Behaviour in Slab % mode

- Every band column/axis label becomes the slab band, e.g. `12% (3.50 – under 4.00)`.
- Tables show **Count** and **Actual %** only. Target %, Variance %, Compliance status and the Normalization recommendations card are hidden, because no targets are defined for slab bands.
- KPI cards adapt: "Highest / Lowest rating count" become highest and lowest slab counts; the "Bell Curve Compliance" card is replaced by "Bands in use". Total employees and average rating stay unchanged.
- The bell curve chart in slab mode shows the actual distribution across slab bands without the target normal-curve overlay.
- Heat map keeps search, sorting, number/percentage toggle and multi-select drill-down; only the columns change. A selection made in one mode is preserved when switching back.
- Employees with no final score stay excluded from the denominator, exactly as today.
- Exports carry the active mode in the header row and use the matching columns.

## Technical notes

- `src/lib/annualReview/bellCurve.ts` gains a mode-agnostic band layer: `BandMode = 'rating' | 'slab'`, `slabBandsFor(slabs)` (keys derived from the slab master), `bandKeyOf(row, mode, slabs)` and generalised `computeDistribution` / `groupDistribution` / `heatmapMatrix` / `computeSummary` that accept a band descriptor list. Rating mode keeps its existing behaviour and signatures via defaults, so nothing else in the app changes.
- Slab resolution reuses the ADR-212 SSOT (`toRatingOutOf5` + `resolveSlab`); no percentages are hardcoded and no new query beyond the existing `useAnnualReviewRatingSlabs()` hook (React Query cached).
- Where a band has no target (slab mode), `targetPct`/`variancePct`/`compliance` are `null` and the UI omits those columns rather than rendering 0.
- Components touched: `BellCurveTab.tsx` (mode state + toggle), `BellCurveChart.tsx`, `DistributionBarChart.tsx`, `VarianceTable.tsx`, `RatingHeatmap.tsx`, `bellCurveExport.ts`.
- No schema, RPC or RLS change. Presentation-only, additive.

## Tests and docs

- New cases in `src/test/annualReview/bellCurve.test.ts`: slab banding at boundary ratings (2.00 / 3.00 / 4.50), null score exclusion, distribution sums to 100%, empty slab master falls back to the seeded defaults, and rating-mode results are unchanged.
- `ADR-218b` addendum, `POLICY §AR-BELL-CURVE` item for band modes, `DOCUMENTATION.md` version-history entry, and a memory update to `mem/features/reports/bell-curve-analysis.md`.
- Rollback: remove the toggle and the mode parameter defaults back to rating bands.

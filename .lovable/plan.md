## Goal
In the KPI details "Rating Scale" section, when a KPI is Binary or Tiered (qualitative), show the mapped option labels (e.g. Yes/No, or tier names) with their rating scores instead of the generic R5–R1 percentage thresholds.

## Current behavior
`src/components/review/KpiMetricsSection.tsx` always renders R5/R4/R3/R2/R1 rows pulled from `kpi.r5…r1` (percentage thresholds). For binary/tiered KPIs those columns are usually empty or meaningless — the real mapping lives in `kpi.qualitative_options` (`[{ label, rating, definition }]`) with `kpi.uom_type ∈ 'binary' | 'tiered'`.

## Change (single file: `KpiMetricsSection.tsx`)

1. Detect qualitative KPI: `isQualitative = kpi.uom_type === 'binary' || kpi.uom_type === 'tiered'`.
2. When `isQualitative` and `kpi.qualitative_options` has entries:
   - Sort options by `rating` descending.
   - Render one `RatingRow` per option:
     - `label` = option `label` (e.g. "Yes", "No", tier name)
     - `value` = `Rating: {rating}` (or just the rating number)
     - `colorClass` = mapped from rating using existing severity palette (5→blue, 4→green, 3→yellow, 2→orange, 1/0→red) — same colors already used for R5–R1 so visual consistency is preserved.
     - `tooltipContent` = the option's `definition` if present, else `"Score: {rating}"`.
   - Section title stays "Rating Scale"; sub-label switches to "Option Mapping" for qualitative KPIs so users know what they're looking at.
3. Otherwise (numeric): keep the existing R5–R1 rendering untouched.
4. Binary inverted safety case (Yes=0 / No=5) works automatically because we sort by `rating` and read labels from `qualitative_options` — no special-casing needed.

## Not changing
- No data model, hook, or DB changes.
- No changes to scoring, hydration, or any reviewer flow.
- Numeric KPI display is unchanged.

## Risk & regression
- Scope: display-only, one file. No logic touched.
- Fallback: if `uom_type` is qualitative but `qualitative_options` is null/empty, fall back to existing R5–R1 rendering so nothing disappears.
- Manual verification: open a Binary KPI (Yes/No) and a Tiered KPI in the review sheet; confirm labels + colors render. Open a numeric KPI and confirm unchanged.

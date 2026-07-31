# Annual Review Report — Final Rating (out of 5) + Increment Slab

## What you get

Two new columns in the Annual Review Report, driven by the existing Final Score:

1. **Final Rating (/5)** — the normalised 0–100 final score converted to a 5-point rating, shown to 2 decimals (e.g. `4.25`). Blank (`—`) when the review has no final score yet.
2. **Slab %** — the increment percentage resolved from that rating against an admin-maintained slab table.

Both appear in the **Detail** tab and the **Comprehensive** tab, and in both Excel exports.

## Slab bands (seeded defaults, editable by Admin)

| Rating range | Increment |
|---|---|
| below 2.00 | 0% |
| 2.00 – under 2.50 | 4% |
| 2.50 – under 3.00 | 6% |
| 3.00 – under 3.50 | 8% |
| 3.50 – under 4.00 | 12% |
| 4.00 – under 4.50 | 16% |
| 4.50 and above | 20% |

Exact boundary values go to the higher slab, as you confirmed (2.00 → 4%, 3.00 → 8%, 4.50 → 20%).

## Where it appears

- **Detail tab table**: two new right-aligned columns after `Rating`.
- **Comprehensive tab table**: same two columns, plus the two values added to the per-employee summary block that already lists Final Score / Final Rating.
- **Exports**: `Final Rating (out of 5)` and `Slab %` added to both Excel sheets.
- No change to filters, pagination, sorting, or row counts.

## Admin configuration

A new **Annual Review → Rating Slabs** settings card (alongside the existing annual review settings) lets an Admin add/edit/delete slab rows: rating from, rating to, increment percent, order, active flag. Validation blocks overlapping or gapped bands before save. Changes are audit-logged with the acting user.

## Technical notes

- **Conversion**: `rating5 = total_score / 20`, rounded to 2 dp. `total_score` is already guaranteed 0–100 by ADR-187 / `trg_ar_total_score_scale`. A null score yields a null rating and a null slab (never 0%).
- **New table** `public.annual_review_rating_slabs` (`rating_from`, `rating_to`, `increment_percent`, `sort_order`, `is_active`, timestamps, `created_by`) with GRANTs and RLS: read for authenticated, write restricted to `admin` / `hr_pms` via `has_role`. Seeded with the seven bands above. Picked up automatically by backup coverage (no denylist entry).
- **SSOT resolver** `src/lib/annualReview/ratingSlab.ts`: pure `toRatingOutOf5(totalScore)`, `resolveSlab(rating, slabs)`, `validateSlabBands(slabs)`. Half-open `[from, to)` matching with an open-ended top band. Both report tabs and the settings UI import this — no duplicated logic.
- **Data hook** `useAnnualReviewRatingSlabs()` (React Query, cached) feeds both tabs; no per-row queries and no change to the existing paginated instance queries.
- **Tests**: boundary values (1.99 / 2.00 / 2.49 / 2.50 / 3.00 / 4.49 / 4.50 / 5.00), null score, and band-validation failures (overlap, gap).
- **Docs**: new `ADR-212`, `POLICY §AR-RATING-SLAB`, and a DOCUMENTATION.md version-history entry.
- **Rollback**: additive only — dropping the table and reverting the two column additions restores current behaviour; no existing data is mutated.
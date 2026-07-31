# Heat map drill-down columns + Admin Final Rating calibration

## Part 1 — Drill-down table columns (UI only)

In the expanded employee list under a heat map cell:

- Remove: **Department**, **Final Score**, **Rating /5**
- Add: **Rating Given by Dept**, **Rating Given by BU**

Resulting columns: Code · Name · Grade · Manager · Rating by Dept · Rating by BU · Slab % (plus a Calibrated flag, see Part 2).

The two new ratings already exist in the report dataset (`dept_head_rating_5`, `bu_head_rating_5`, ADR-179) — they are the /5 stage ratings, shown as `4.20` or `—` when the stage was not scored/enabled. They are added to `BellCurveInput`/`BandEmployee` so the drill-down and its CSV export both carry them. Banding, counts and every other chart stay driven by the final rating exactly as today — this is a display change only.

## Part 2 — Admin calibration of the Final Rating (/5)

### Concept

Calibration is an **override layer**: the computed final score and rating are never overwritten. An admin records a calibrated rating (/5) with a mandatory reason; every consumer then reads the *effective* rating = calibrated rating when present, otherwise the computed one. Slab % re-derives from the effective rating (ADR-212 bands, unchanged). Clearing a calibration restores the computed value instantly.

### Where an admin can calibrate

1. **Bell Curve drill-down row** — a "Calibrate" action per employee, plus row checkboxes and a **Bulk calibrate** button ("move N selected employees to rating X" or "to slab band Y").
2. **Annual Review Report grid** (Comprehensive/Detail rows) — same per-row action.
3. **Employee review detail page** — next to the existing "Update system scores" admin action.

All three open the same dialog: current computed rating & slab → new rating (/5, 0–5, 2 dp) → resulting slab preview → mandatory reason → save. Non-admins never see the action, and the server rejects them regardless.

### What changes downstream

- **Bell Curve analysis** — banding, KPI cards, curve, bar chart, variance, heat map counts, drill-down and both tab exports use the effective rating.
- **Annual Review Report** — Final Rating (/5) and Slab % columns use the effective rating, with a small "Calibrated" badge and tooltip (original → calibrated, reason, who, when). Excel exports gain `Computed Rating`, `Calibrated Rating`, `Calibration Reason`.
- **Employee review page** — shows the calibrated rating as the final rating, marked as calibrated.
- **Increment / incentive eligibility** — the slab used for increment is resolved from the effective rating. The exact increment read path is confirmed first; if it computes server-side, the resolver is added there too so UI and engine cannot diverge.

### Guardrails

- Admin-only (`has_role(auth.uid(),'admin')`), enforced in the RPC, not just the UI.
- Mandatory reason; full history retained (every calibration and clear is a new audit row).
- Bulk calibration is capped per submit, runs in one transaction, and shows a preview of affected employees before applying.
- Calibration does not change stage scores, criteria answers, workflow status or `total_score`, so no existing invariant (ADR-187) is touched.

## Technical notes

- New table `public.annual_review_calibrations` — one active row per instance (`instance_id` unique) with `computed_score`, `computed_rating`, `calibrated_rating`, `reason`, `calibrated_by`, timestamps; GRANTs for `authenticated` (read) + `service_role`; RLS: read by anyone who can already read that instance, write only through the RPC. Companion append-only `annual_review_calibration_audit` for history including clears.
- New SECURITY DEFINER RPCs: `admin_calibrate_final_rating(p_instance_id, p_rating, p_reason)`, `admin_clear_final_rating_calibration(p_instance_id, p_reason)`, `admin_bulk_calibrate_final_rating(p_instance_ids[], p_rating, p_reason)` — all admin-gated, all writing audit rows.
- `get_annual_review_comprehensive_report` returns `calibrated_rating`, `calibration_reason`, `calibrated_by_name`, `calibrated_at` so no extra fetch is needed by the report or the bell curve tab.
- New SSOT `src/lib/annualReview/effectiveRating.ts`: `effectiveRating(row)`, `isCalibrated(row)`, `effectiveSlabPercent(row, slabs)`. `bellCurve.ts#ratingOf` delegates to it, so every band, count and export follows automatically. No component computes `total_score / 20` directly any more.
- Service layer `src/services/annualReview/calibration.ts` (payload + RPC calls, React Query invalidation of the report keys); UI `CalibrateRatingDialog.tsx` + `BulkCalibrateDialog.tsx` under `components/annual-review/`.
- Server-side mirror of the resolver for the increment path, so slab-driven increments and the UI agree.

## Risk & impact

- **Data**: additive only — two new tables and extra RPC output columns. No existing row is mutated; `total_score` and `final_rating` untouched.
- **Workflow/permissions**: none for reviewers; new admin-only capability.
- **UI/UX**: drill-down loses 3 columns and gains 2 (narrower table); calibrated values are always visibly badged so no silent number changes.
- **Regression**: the main risk is a consumer that still reads the raw rating and disagrees with a calibrated one. Mitigated by routing everything through `effectiveRating` and by tests asserting parity between heat map counts and the drill-down list after calibration.
- **Performance**: calibration data rides along the existing paged report RPC — no new round trips.
- **Rollback**: drop the two tables and RPCs; the resolver falls back to the computed rating with no code change needed.

## Verification

- Unit tests: effective-rating precedence, slab re-derivation from a calibrated rating, band membership moves with calibration, count parity of `employeesInBand` vs heat map cells after calibration, non-admin rejection payload, bulk cap.
- Docs: ADR-220 (calibration), ADR-218d (drill-down columns), POLICY §AR-FINAL-RATING-CALIBRATION, DOCUMENTATION.md version bump, memory update.

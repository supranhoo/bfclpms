Two independent workstreams. **A** — make the KRA-derived rating visible to employees and add scoring-transparency columns to the Annual Review Report. **B** — the already-scoped June "Control dust emission" KPI rescale (your three answers are baked in).

## Assumptions

Verified by reading the code before writing this:

- `src/lib/annualReview/kraDerivedRating.ts` + `src/hooks/useKraDerivedRatingsForInstances.ts` already compute a KRA-derived `rating_0_5` and a projected `{ total_0_100, rating }` — but they are consumed by the **admin grid only** (ADR-130).
- `src/components/annual-review/EmployeeResultsView.tsx` derives its rating solely from `instance.total_score` (`ratingOutOf5 = total_score / 100 * 5`) and renders the badge only when `instance.final_rating` is set. For a KRA-based template, criteria scores stay 0 and those fields are empty until HR finalizes — that is why the employee sees "—". *Unconfirmed for the specific employee who reported it;* step A1 confirms it against real rows before anything is changed.
- `ComprehensiveRow` (`src/services/annualReview/comprehensiveReport.ts`) carries no `template_id`, no scoring-mode flag, no `criteria_weighted_score`, and no `system_scores` — so neither the on-screen report nor `ComprehensiveExport.ts` can currently show how a score was derived.

## Clarifications

Resolved for workstream B: June 2026 only · map rating→case count · include approved rows in the rescore. Nothing outstanding for A; I'll surface both the *achieved* and the *maximum* for every parameter so the arithmetic is checkable by hand.

## Risk & Impact Report

**A — KRA rating visibility + report columns**

- *Data impact:* none for the UI change (read-only projection). The report needs the RPC `get_annual_review_comprehensive_report` to return additional columns — additive only, no column removed or renamed, so existing consumers keep working.
- *Workflow impact:* none. No stage, permission, or finalization behaviour changes. A projected rating is labelled "Provisional" until `finalized_at` is set, so nobody mistakes it for a final decision.
- *UI/UX impact:* described in its own section below.
- *Regression risk:* medium on the report (RPC signature change ripples into `ComprehensiveTab.tsx`, `ComprehensiveExport.ts`, `RatingDistributionChart.tsx`, `HighlightsPanel.tsx`); low on the employee view. Mitigated by additive columns, optional TS fields, and existing tests (`comprehensiveReportRca.test.ts`, `comprehensiveReportPaging.test.ts`) staying green.
- *Scalability:* the report already pages RPC results at 1,000 rows via `fetchAllRpcPaged`; new columns are per-row scalars plus one JSONB, so payload grows modestly. The employee view resolves one instance — no batching needed. The report will **not** live-recompute carry-KRA snapshots per row (that would be N queries); the scoring-mode flag and the stored system-score breakdown come from the RPC in one pass.

**B — dust KPI rescale**

- *Data impact:* 12 `kpis` rows (verified: June 2026, `uom_type='binary'`, `kpi_name LIKE 'Control dust emission%'`, 12 distinct employees; a 13th June row is already on the correct 6-band scale and is excluded). Their 12 `review_submissions` all store `self_achieved_value = 5` as a **binary rating**, not a case count — so the value remap is mandatory or everyone would silently rescore from 5 to 0.
- *Immutability:* 7 of 12 rows carry a final score. Rewriting them is an explicit, admin-initiated, audit-logged exception following the ADR-171 monotonic pattern — writes are non-decreasing.
- *Regression risk:* contained by an exact-ID allowlist, a dry-run diff, and a snapshot table that makes rollback one statement.

## Step-by-step plan

### A. KRA-derived rating visible to the employee

**A1 — Confirm the reported case.** Query instances on KRA-based templates and show, for a sample, `total_score`, `final_rating`, `criteria_weighted_score`, `system_scores`. Confirms the "—" is the empty-`total_score` path and not something else. *Verification: a row-level before/after table.*

**A2 — Reuse the SSOT, don't fork it.** Add a single-instance hook `useKraDerivedRating(instance, template, fiscalYear)` wrapping the existing `projectKraFinalFromSystemScores` / `kraPointsToRating0to5`. No new maths. *Verification: unit test asserting the hook and the admin grid return identical numbers for the same input.*

**A3 — Render it in `EmployeeResultsView`.** When the template is KRA-based and `total_score` is empty, show the projected rating instead of "—", flagged as provisional. *Verification: tests for KRA-provisional, KRA-finalized, and non-KRA templates.*

**A4 — Scoring breakdown card.** A "How your score was calculated" block listing every parameter with achieved / out-of / weight: each criterion, each system slot (including the KRA slot with its month-wise rollup), and the resulting total. Reuses the existing Carry-KRA monthly breakdown rather than duplicating it.

### B. Annual Review Report — derivation column + full parameters

**B1 — Extend the RPC** `get_annual_review_comprehensive_report` (additive columns only): `template_id`, `template_name`, `scoring_mode` (`With KRA` / `Without KRA` / `Blended`), `criteria_weighted_score`, `criteria_max_points`, `system_weight_total`, `kra_weight`, `kra_points`, `system_scores` (JSONB), `system_scores_raw` (JSONB). `scoring_mode` is derived server-side from the template's `system_scores[].source = 'carry_kra'` — mirroring `isKraBasedTemplate`, with a test asserting SQL/TS parity.

**B2 — Widen `ComprehensiveRow`** with the new optional fields and add a `scoringModeLabel(row)` helper next to the existing `eligibilityLabel` / `completionStatus` helpers.

**B3 — On-screen column** "Rating Derived From" in `ComprehensiveTab.tsx`, plus a filter on that value so HR can isolate the KRA cohort. Existing pagination/sort untouched.

**B4 — Export parameters.** Add to the Employee sheet: Template, Rating Derived From, Criteria Weighted Score, Criteria Max, System Total, KRA Weight, KRA Points, KRA Rating /5, and one column per system slot (achieved / out-of). Add a second **"Score Parameters"** sheet — one row per employee × parameter (`Employee · Parameter · Type · Achieved · Out Of · Weight · Contribution`) so any final score can be re-added by hand.

**B5 — Tests.** Scoring-mode classification (KRA / non-KRA / blended), export column presence, parameter-sheet arithmetic summing to the reported total, and the existing report tests still green.

### C. June "Control dust emission" KPI rescale

**C1 — RCA the 0.00 finals (diagnosis first, unconfirmed).** 7 rows show `final_score = 0.00` with `self_score = 5.00` and `manager_score = 5.00`, and the same 7 show `hr_pms_score = 0`. I will trace `final_score_rule_type` / `final_score_rule_snapshot` / `final_score_explanation` and `kpi_audit_logs` and report a written 5-Why with the exact rule and writer — no fix before the cause is named.

**C2 — Freeze the target set** into `kpi_dust_emission_rescale_2026_06` (12 KPI definitions + 12 submissions, old values and all stage scores).

**C3 — Dry-run preview:** per employee, old value → new case count → new rating → delta. Expected delta 0 for all; shared with you before any write.

**C4 — Apply the definition change** to the 12 allowlisted ids: `uom_type='numeric'`, `threshold_mode='absolute'`, `r5..r0 = 0,1,2,3,4,>4`, `qualitative_options = NULL`, new Scoring Logic wording.

**C5 — Remap values and rescore** across every stage column (`self`, `manager`, `auditor`, `hr_pms`, `skip_level`, `management`, `final`): rating 5 → 0 cases, rating 0 → 5 cases. Writes are non-decreasing, so nobody can be downgraded.

**C6 — Fix what C1 found**, reporting first how many other KPIs/periods are exposed if the cause is systemic.

**C7 — Tests:** remap (5→0, 0→5), the six-band absolute rating for 0/1/2/3/4/5 cases, the non-decreasing guard, and the June-2026-only scope filter.

### D. Documentation

`docs/adr/ADR-174.md` (KRA rating visibility + report transparency) and `docs/adr/ADR-175.md` (KPI scale migration), `DOCUMENTATION.md` version history, and `POLICY.md`: **§AR-KRA-RATING-VISIBILITY** (a KRA-derived rating must never render as "—" to the employee; provisional values must be labelled) and **§KPI-SCALE-MIGRATION** (binary→numeric conversion must remap stored achieved values in the same transaction and may never decrease a recorded score).

## UI changes

1. **Employee results page** (`EmployeeResultsView`, top score grid): the "Total score" tile's `≈ x / 5` line is populated from the KRA projection when `total_score` is empty, with a small "Provisional — from KRA" caption; the header rating badge shows the projected band with the same provisional styling until `finalized_at` is set. Existing responsive grid (`sm:grid-cols-1/2`) is unchanged.
2. **New collapsible "How your score was calculated"** card, placed directly below the score tiles and above Recommendations — collapsed by default so the current page rhythm is preserved. Contains a parameter table (Parameter · Achieved · Out of · Weight · Contribution) and, for KRA templates, the month-wise KRA rollup. On mobile it becomes a stacked list rather than a table.
3. **Annual Review Report → Comprehensive tab:** one new "Rating Derived From" column (`With KRA` / `Without KRA` / `Blended`) rendered as a badge, plus a matching filter chip in the existing filter row. Column ordering places it next to "Rating".
4. **Excel export:** new columns on the Employee sheet and a new "Score Parameters" sheet. No screen impact.

## Rollback

- A/B are code-only plus additive RPC columns — revert the code, drop the added columns; no data is mutated.
- C is fully reversible from `kpi_dust_emission_rescale_2026_06` with one `UPDATE … FROM` per table, restoring definitions, achieved values and every stage score. No destructive schema change.

## Technical details

- All DB work goes through the migration tool (schema/function) and the insert tool (data) — never ad-hoc SQL.
- The rescale runs inside one `SECURITY DEFINER` admin RPC with an explicit id allowlist: repeatable, idempotent, cannot escape June 2026. Every write logs to `kpi_audit_logs` with actor, old value, new value, and an ADR reference.
- Band evaluation reuses `src/lib/ratingCalculation.ts` (`calculateAbsoluteRating`); the SQL mirrors it and a test asserts parity.
- KRA logic is reused from `src/lib/annualReview/kraDerivedRating.ts` — no second implementation. `scoring_mode` in SQL is parity-tested against `isKraBasedTemplate`.

## Post-implementation notes

I will report: the confirmed 5-Why for the 0.00 finals, the 12-row before/after table for the dust KPI, the count of rows actually rewritten, whether the finals bug extends beyond this KPI, and a screenshot of the employee view showing a previously-blank KRA rating now rendered.

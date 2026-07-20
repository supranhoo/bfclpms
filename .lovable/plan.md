
## Problem (verified)

For Sourav Kumar Jaiswal (100972) — and every employee mapped to a KRA-based template such as **Generic M / W - (With KRA)** — the Annual Review admin grid shows `—` in every column (Self /5, Manager /5, Dept /5, BU /5, Final, Rating).

### Root cause

- The grid's `Self /5 … HR /5` columns are derived from `annual_review_responses.weighted_score` via `computeCriteriaRatingOutOf5(criteria, weightedScore, role)` (`AnnualReviewAdmin.tsx:966`).
- KRA-based templates carry the score through the `carry_kra` slot inside `system_scores_raw`, NOT through per-criterion ratings. Reviewers submit with `criteria_scores = {}` and `weighted_score = 0.00` (confirmed for 100972: self/dept locked, both `weighted_score=0.00`).
- The `Final` and `Rating` columns read `instances.total_score` / `final_rating`, both of which are only written on completion (ADR-124). Nothing is shown while the instance is still moving through stages, even though a KRA-based rating is fully determined the moment KRA data is present.

Result: the grid tells the user "no data" for exactly the employees whose scores ARE known.

## Fix plan

Presentation-only. No changes to stored responses, weighted_score, or the finalization RPCs.

### 1. New helper `src/lib/annualReview/kraDerivedRating.ts`
- Given an instance + resolved template, detect a "KRA-based" template (template exposes a `carry_kra` slot in `sections.system_slots` OR name matches the "*(With KRA)*" archetype).
- Read `system_scores_raw.carry_kra` (already ADR-116 stable-key backed) → normalise to `/5` using the slot's `max_points` (or the KRA rules if `scoring_rules.carry_kra` is defined).
- Return `{ isKraTemplate, kraRating_0_5, kraPoints, kraMaxPoints }` or `null` when the KRA value is not yet present.
- Unit tests covering: non-KRA template (null), KRA template with no value (null), KRA template with 4.2/5, KRA template using scoring_rules override.

### 2. Grid column fallback (`src/pages/annual-review/AnnualReviewAdmin.tsx`)
Inside the row map (around L966), when the template is KRA-based:
- Replace the per-stage `fmt(ss.role, role)` with `fmt(ss.role, role) ?? kraRating_0_5.toFixed(1)` for every stage that has a locked/submitted response for that role. i.e. once Self is locked and KRA data exists, Self /5 shows the KRA rating; same for Manager/Dept/BU/HR as each stage submits.
- Add a small `KRA` chip after the stage name in the "Stage" cell so it's obvious the numbers are KRA-derived, not criteria-derived.

### 3. Live Final + Rating for in-flight KRA rows
- When the template is KRA-based and `total_score IS NULL`, compute a projected final on the client with the existing `annual_review_compute_final_summary` inputs (system_scores + carry_kra + weights), reuse `computeFinalScore` / `resolveRating` from `runningFinalScore.ts`.
- Render as `21.7*` (asterisk + tooltip: "Projected — pending BU Head") to keep it visually distinct from a finalized value. Rating column shows the projected band label with the same asterisk.
- Zero server changes; the SSOT for the final math stays `annual_review_compute_final_summary` (ADR-126). This projection uses the same TS mirror.

### 4. Export parity
Update `exportProgress` (same file, L327+) and `src/services/annualReview/exports.ts` so the xlsx export emits the KRA-derived per-stage rating and projected final for KRA rows, with a new "Score Source" column (`kra` vs `criteria`) so the user can filter in Excel.

### 5. Tests
- Extend `src/lib/annualReview/runningFinalScore.test.ts` with a KRA-only case.
- New test in the admin grid render (react-testing-library) verifying that a KRA row with `carry_kra=45`, template max 50, and a locked self response renders `Self /5 = 4.5` and a projected Final with asterisk.

## Risk & impact

- Data: none — no writes. `weighted_score`, `final_rating`, `total_score` untouched. Trigger `trg_annual_review_guard_completion` and ADR-124 finalization path unchanged.
- Workflow: none — stages, RLS, RPCs untouched.
- UI: adds numbers where "—" was shown; adds a `KRA` chip on affected rows and an asterisk on projected values.
- Regression: `computeCriteriaRatingOutOf5` still runs first for non-KRA templates; the KRA fallback only fires when the value is null AND the template is KRA-based.

## Rollback

Pure client change — revert the two files (`kraDerivedRating.ts` + `AnnualReviewAdmin.tsx` diff) to restore prior behaviour.

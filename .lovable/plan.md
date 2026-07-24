
## Confirmed root cause (Ankit Choudhary, 101785)

Verified against the database, not inferred:

- `annual_review_instances`: `enabled_stages = [self, dept_head, bu_head]`, `dept_head_id = bu_head_id` (both Jaspal), `total_score = 91.72`, `management_id = NULL`.
- `annual_review_responses` for this instance: two locked rows only — `self` and `bu_head`. Both have `criteria_scores = {}` and `weighted_score = 0.00`. There is **no** dept_head response and no self criteria entries at all — the template is 100% system-scored (ADR-140), so the 91.72 total comes from `annual_review_system_scores`, not from any per-stage criteria.

The RCA card in `src/components/reports/annual-review/ComprehensiveTab.tsx` renders three problems from that shape:

1. **Self / BU Head "Rating" shows "Below Expectations"** even though the reviewer never entered any criteria. `stageRatingFromScore(0)` maps `0` to the lowest bucket. A 0 that means "not-applicable / system-only" is displayed as if the reviewer had actively scored the employee poorly.
2. **A separate "HOD / Manager" row appears** for Jaspal with blank score/comment, because the row is emitted whenever `enabled_stages` contains `dept_head`. For a collapsed dept=BU case, this row duplicates the BU Head row and misleads the reader.
3. **Self Comment shows "—"** with no context that this template is system-scored, so the viewer assumes the employee never wrote anything (they had nothing to write — no criteria).

## Fix (UI + export only — no schema, no policy change)

Scope is intentionally limited to the presentation layer. The underlying scores, responses, and RLS remain untouched.

### 1. Suppress rating when a stage carries no real signal
In `ComprehensiveTab.tsx` and `ComprehensiveExport.ts`, treat a stage as "no rating" when there is **no locked reviewer signal** for it. Concretely, a stage row shows `Rating = —` when its score is `null` or `0` **and** the stage has no accompanying comment. Only render a bucket label ("Below Expectations", etc.) when the score is > 0 or a comment exists.

Add a small helper `stageRatingDisplay(score, comment)` colocated with `stageRatingFromScore` in `services/annualReview/comprehensiveReport.ts` and reuse it from both the card and the Excel exporter so screen and export stay in sync.

### 2. Collapse dept_head row when dept_head_id == bu_head_id
In the RCA card's `stageCells` builder, skip the `HOD / Manager` row when `r.dept_head_id === r.bu_head_id` (both present) — the BU Head row already represents that reviewer. When they differ, keep both rows as today.

### 3. System-scored template banner
When the instance's `enabled_stages` includes `self` but the self response has empty `criteria_scores` **and** `total_score > 0`, render a one-line muted banner above "Stage scores":

> System-scored template — per-stage criteria were not collected. Final Score reflects system inputs only.

Signal is derived from the existing report row: `self_score == 0 && total_score > 0 && !self_comment`. No new RPC field required.

### 4. Export parity
Update `ComprehensiveExport.ts` to:
- Use `stageRatingDisplay` for all four stage rating columns.
- Blank out the "HOD Rating / HOD Score / HOD Comment" columns when `dept_head_id == bu_head_id`.

## Out of scope

- No change to `get_annual_review_comprehensive_report` RPC.
- No change to `annual_review_instances`, `annual_review_responses`, triggers, or RLS.
- No repair of 101785's data — the data is correct; only its rendering was wrong.
- `enabled_stages` normalization (stripping `dept_head` when dept=BU) is a separate concern already tracked under ADR-137R and is **not** re-attempted here.

## Files touched

- `src/services/annualReview/comprehensiveReport.ts` — add `stageRatingDisplay`.
- `src/components/reports/annual-review/ComprehensiveTab.tsx` — apply items 1–3.
- `src/components/reports/annual-review/ComprehensiveExport.ts` — apply items 1 and 4.
- `src/test/comprehensiveReportRca.test.ts` — extend existing test with three new cases: (a) self_score=0 with empty comment ⇒ rating `—`, (b) dept=BU collapse hides HOD row, (c) system-scored banner triggers when self_score=0 and total_score>0.
- `docs/adr/ADR-155.md` — new ADR documenting the display rule.
- `DOCUMENTATION.md` / `POLICY.md` — one-line entry under the Annual Review Reports section.

## Visual result for 101785

- HOD / Manager row: **removed** (dept=BU collapse).
- Self row: Score `0.00`, Rating `—`, Comment `—`.
- BU Head row: Score `0.00`, Rating `—`, Comment `—`.
- Banner: "System-scored template — per-stage criteria were not collected."
- Outcome unchanged: Final Score 91.72, Final Rating Outstanding.
